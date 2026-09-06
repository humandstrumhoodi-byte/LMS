# ZKTeco K40 Pro — Attendance Integration Setup

This connects the K40 Pro directly to the LMS over the internet using ZKTeco's
ADMS ("push") protocol — the device sends every punch to the app in near
real time, no PC or middleware software required.

## 1. Deploy the code

```
supabase/add_biometric_attendance.sql   → run in Supabase SQL Editor
```

Then deploy the app to Vercel as usual. This adds:
- `POST/GET /api/iclock/cdata`, `/api/iclock/getrequest`, `/api/iclock/devicecmd` — the device talks to these directly, no login required (see "Security" below)
- `GET /api/attendance/rollup` — nightly job, runs automatically via the new `vercel.json` cron entry at 1:00 AM IST
- `/dashboard/attendance` — admin screen (superadmin/center_manager only) for staff↔device mapping, daily records, device management, and manual import

**Vercel Hobby plan note:** cron jobs are capped at 2 on the free plan. This repo now defines 3 (`/api/cron`, `/api/cron-fines`, `/api/attendance/rollup`). If the deploy fails on cron limits, either upgrade to Vercel Pro, or trigger `/api/attendance/rollup` from a free external scheduler (e.g. cron-job.org) hitting your Vercel URL with the `Authorization: Bearer <CRON_SECRET>` header instead.

Set `CRON_SECRET` in Vercel's environment variables (see `.env.local.example`).

## 2. Register the device in the app

1. On the K40 Pro: **Menu → System Info → Device Info** — note the serial number.
2. In the app: **/dashboard/attendance → Devices tab** → add it with that serial number, a name, and location.

Only registered, active serial numbers are accepted — the ADMS protocol has
no login of its own, so this is the gate that keeps random internet traffic
from writing fake punches.

## 3. Point the device at your server

On the K40 Pro: **Menu → Comm → Cloud Server Setting** (may show as "ADMS" on
some firmware versions):

| Setting | Value |
|---|---|
| Enable Domain Name | On (lets you use a hostname instead of raw IP) |
| Server Address | `your-app.vercel.app` (no `https://`, no path) |
| Server Port | `443` |
| Enable Proxy Server | Off |

Some firmware instead exposes this as **Menu → Comm → Ethernet/WiFi → ADMS**
with separate **Server IP** and **Server Port** fields — same idea, point it
at your deployed domain on port 443.

The device pushes to fixed paths on that host: `/iclock/cdata`,
`/iclock/getrequest`, `/iclock/devicecmd` — already wired up in this repo, no
further path configuration needed.

**Time zone:** set the device's own clock/time zone to IST (Asia/Kolkata)
under **Menu → System → Date/Time**. The webhook currently assumes incoming
punch timestamps are already in IST — if the device clock is wrong, every
attendance record will be off by that same amount.

## 4. Enroll staff and map biometric IDs

1. Enroll each staff member's fingerprint directly on the device (**Menu →
   User Mgt → New User**) — note the **User ID / PIN** it assigns.
2. In the app: **/dashboard/attendance → Staff mapping tab** → enter that PIN
   against the matching staff member. Punches only attach to a person once
   this is filled in — unmatched punches are still stored (visible via the
   `attendance_punches` table) so nothing is lost if mapping happens later.

## 5. Verify it's working

- Have someone punch in/out on the device.
- Check **Devices tab** — "Last seen" should update within a few seconds.
- Query `attendance_punches` in Supabase (or wait for the punch to show once
  mapped) to confirm the row landed.
- The **Daily attendance tab** only populates after the nightly rollup runs
  (1:00 AM IST) — to see today's data immediately for testing, call
  `GET /api/attendance/rollup?date=YYYY-MM-DD` with header
  `Authorization: Bearer <CRON_SECRET>` (Postman, curl, or a browser extension
  that can set headers — a plain browser tab can't set the Authorization header).

## 6. No internet at the device, or ADMS isn't available on your firmware?

Use the **Manual import tab** instead: export punches to a USB pendrive from
the device (**Menu → USB Manager → Download Attendance**), open the `.dat`
file in a text editor, and paste its contents in. Same underlying parser as
the live webhook, so staff mapping and the nightly rollup work identically
either way — it's a fallback for data delivery, not a different feature.

## What this does *not* yet do

This covers ingestion and a daily present/absent/half-day/late rollup per
staff member — the attendance data payroll will eventually consume. It does
**not** yet include leave management (accrual, approval, balances) or the
payroll engine itself (salary structure, PF/ESI/PT/TDS, payslips) — see the
`staff-attendance-payroll-plan.md` doc for that scope, which builds on the
`staff_attendance_daily` table this sets up.
