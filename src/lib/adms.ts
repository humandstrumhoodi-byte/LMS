// Shared parsing/ingestion for ZKTeco ATTLOG-format punch records —
// used both by the live ADMS webhook (/api/iclock/cdata) and the manual
// import route (/api/attendance/import, for USB pendrive exports or a
// one-off backfill before ADMS is confirmed working on the device).
import { serviceSB } from '@/lib/server'

export async function ingestAttlog(deviceSerial: string, raw: string): Promise<{ inserted: number; unmatched: number }> {
  const svc = await serviceSB()
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return { inserted: 0, unmatched: 0 }

  const { data: profiles } = await svc.from('profiles').select('id, biometric_id').not('biometric_id', 'is', null)
  const byBiometricId = new Map((profiles || []).map(p => [p.biometric_id as string, p.id as string]))

  let unmatched = 0
  const rows = lines.map(line => {
    // Standard ATTLOG line: PIN \t TIME \t STATUS \t VERIFY \t WORKCODE [...]
    // Also tolerate comma-separated exports from ZKTeco's desktop attendance software.
    const parts = line.includes('\t') ? line.split('\t') : line.split(',').map(s => s.trim())
    const [pin, time, status, verify] = parts
    if (!pin || !time) return null
    const isoish = time.includes('T') ? time : time.replace(' ', 'T')
    const punchTime = new Date(isoish.includes('+') || isoish.endsWith('Z') ? isoish : isoish + '+05:30')
    if (isNaN(punchTime.getTime())) return null
    const profileId = byBiometricId.get(pin) || null
    if (!profileId) unmatched++
    return {
      device_serial: deviceSerial,
      biometric_id: pin,
      profile_id: profileId,
      punch_time: punchTime.toISOString(),
      device_status: status ?? null,
      verify_mode: verify ?? null,
      raw_line: line,
    }
  }).filter(Boolean) as any[]

  if (!rows.length) return { inserted: 0, unmatched }

  const { error } = await svc.from('attendance_punches')
    .upsert(rows, { onConflict: 'device_serial,biometric_id,punch_time', ignoreDuplicates: true })

  if (error) {
    console.error('[adms] insert error:', error.message)
    return { inserted: 0, unmatched }
  }
  return { inserted: rows.length, unmatched }
}
