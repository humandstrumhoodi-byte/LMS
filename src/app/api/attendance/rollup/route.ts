// Nightly job: turns raw device punches for one day into one
// staff_attendance_daily row per staff member — the number payroll will
// eventually read. Configure in vercel.json as a Vercel Cron hitting this
// with the same Bearer CRON_SECRET used by /api/cron.
//
// Manual run: GET /api/attendance/rollup?date=2026-09-05
// (defaults to "yesterday" in IST, which is what the nightly cron wants —
// it runs a little after midnight IST, rolling up the day that just ended)
import { NextRequest, NextResponse } from 'next/server'
import { serviceSB } from '@/lib/server'

export const dynamic = 'force-dynamic'

function yesterdayIST(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  ist.setUTCDate(ist.getUTCDate() - 1)
  return ist.toISOString().slice(0, 10) // YYYY-MM-DD
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'hum-strum-cron-2024'
  if (authHeader !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workDate = req.nextUrl.searchParams.get('date') || yesterdayIST()
  const svc = await serviceSB()

  const [{ data: holiday }, { data: rules }, { data: staff }] = await Promise.all([
    svc.from('staff_holidays').select('name').eq('holiday_date', workDate).maybeSingle(),
    svc.from('attendance_shift_rules').select('*'),
    svc.from('profiles').select('id, biometric_id').not('biometric_id', 'is', null),
  ])

  const defaultRule = (rules || []).find(r => !r.profile_id) || {
    expected_in: '09:30', grace_minutes: 15, half_day_minutes: 240, full_day_minutes: 420,
  }
  const ruleByProfile = new Map((rules || []).filter(r => r.profile_id).map(r => [r.profile_id, r]))

  const dayStart = `${workDate}T00:00:00+05:30`
  const dayEnd = `${workDate}T23:59:59+05:30`

  let processed = 0
  const flagged: string[] = []

  for (const person of staff || []) {
    const { data: punches } = await svc
      .from('attendance_punches')
      .select('punch_time')
      .eq('profile_id', person.id)
      .gte('punch_time', dayStart)
      .lte('punch_time', dayEnd)
      .order('punch_time', { ascending: true })

    const rule = ruleByProfile.get(person.id) || defaultRule

    // Existing manual override wins — don't clobber an admin's correction.
    const { data: existing } = await svc
      .from('staff_attendance_daily')
      .select('is_manual_override')
      .eq('profile_id', person.id).eq('work_date', workDate).maybeSingle()
    if (existing?.is_manual_override) continue

    let status: string, needsReview = false, reviewReason: string | null = null, isLate = false
    let firstPunch: string | null = null, lastPunch: string | null = null, totalMinutes = 0
    const punchCount = punches?.length || 0

    if (holiday) {
      status = 'holiday'
    } else if (punchCount === 0) {
      status = 'absent'
      needsReview = true
      reviewReason = 'no_punch'
    } else {
      const firstPunchAt: string = punches![0].punch_time
      const lastPunchAt: string = punches![punchCount - 1].punch_time
      firstPunch = firstPunchAt
      lastPunch = lastPunchAt
      totalMinutes = Math.round((new Date(lastPunchAt).getTime() - new Date(firstPunchAt).getTime()) / 60000)

      if (punchCount === 1) {
        needsReview = true
        reviewReason = 'single_punch'
        status = totalMinutes >= rule.full_day_minutes ? 'present' : 'half_day' // best-effort guess; needs human sign-off either way
      } else if (totalMinutes >= rule.full_day_minutes) {
        status = 'present'
      } else if (totalMinutes >= rule.half_day_minutes) {
        status = 'half_day'
      } else {
        status = 'present'
        needsReview = true
        reviewReason = 'short_duration'
      }

      const [expH, expM] = String(rule.expected_in).split(':').map(Number)
      const firstLocal = new Date(new Date(firstPunchAt).getTime() + 5.5 * 60 * 60 * 1000)
      const minutesLate = (firstLocal.getUTCHours() * 60 + firstLocal.getUTCMinutes()) - (expH * 60 + expM) - rule.grace_minutes
      isLate = minutesLate > 0
    }

    await svc.from('staff_attendance_daily').upsert({
      profile_id: person.id,
      work_date: workDate,
      first_punch: firstPunch,
      last_punch: lastPunch,
      punch_count: punchCount,
      total_minutes: totalMinutes,
      status,
      is_late: isLate,
      needs_review: needsReview,
      review_reason: reviewReason,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id,work_date' })

    processed++
    if (needsReview) flagged.push(person.id)
  }

  return NextResponse.json({ ok: true, date: workDate, staff_processed: processed, flagged_for_review: flagged.length, holiday: holiday?.name || null })
}
