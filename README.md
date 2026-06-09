# Academy LMS — Vercel + Supabase

Full-stack Learning Management System with **Role-Based Access Control**.

## RBAC at a Glance

| Feature | Super Admin | Center Manager | Teacher |
|---|:---:|:---:|:---:|
| User Management | ✅ | ❌ | ❌ |
| Create Teachers | ✅ | ✅ | ❌ |
| Students CRUD | ✅ | ✅ | ❌ |
| Subjects CRUD | ✅ | ✅ | ❌ |
| Schedule Manage | ✅ | ✅ | ❌ |
| View Own Classes | ✅ | ✅ | ✅ |
| Fee Structure | ✅ | ✅ | ❌ |
| Payments | ✅ | ✅ | ❌ |

RBAC is enforced at **two layers**:
- **Middleware** — blocks routes before the page loads
- **Supabase RLS** — DB-level policies using `my_role()` function

---

## 🚀 Deploy in 10 Minutes

### Step 1 — Supabase

1. [supabase.com](https://supabase.com) → New Project
2. **SQL Editor → New Query** → paste `supabase/schema.sql` → **Run**
3. **Authentication → Users → Add User** — enter your email + password
4. Back in SQL Editor:
```sql
UPDATE public.profiles
SET role = 'superadmin', full_name = 'Your Name'
WHERE email = 'your@email.com';
```
5. **Settings → API** — copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### Step 2 — Vercel

**Option A — GitHub (recommended)**
1. Push this folder to a GitHub repo
2. [vercel.com](https://vercel.com) → New Project → Import repo
3. Add Environment Variables (from step 1)
4. Deploy ✓

**Option B — CLI**
```bash
npm i -g vercel
cd academy-lms
vercel
# Add env vars when prompted
```

### Step 3 — Local Dev

```bash
cp .env.local.example .env.local
# Fill in your 3 Supabase values

npm install
npm run dev
# → http://localhost:3000
```

---

## File Structure

```
src/
├── app/
│   ├── login/page.tsx          Login page
│   ├── dashboard/page.tsx      Server-side auth check → DashboardShell
│   ├── api/admin/route.ts      Create/delete/patch users (service role)
│   └── layout.tsx / globals.css
├── components/
│   └── DashboardShell.tsx      All 8 modules in one SPA shell
├── lib/
│   ├── client.ts               Supabase browser client
│   └── server.ts               Supabase server + service clients
├── middleware.ts               Route guard + RBAC
└── types/index.ts              Types + ROLE_PERMS map
supabase/
└── schema.sql                  All tables + RLS + trigger
```

## Adding SMS/Email Reminders

Replace the `alert()` in the Reminder modal with:
```ts
await fetch('/api/notify', {
  method: 'POST',
  body: JSON.stringify({ phone: student.phone, email: student.email, message: '...' })
})
```
Then create `/api/notify/route.ts` using **Twilio** (SMS) or **Resend** (email).

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` only used server-side in `/api/admin` — never exposed to browser
- RLS `my_role()` function runs with `SECURITY DEFINER` — cannot be spoofed from client
- Middleware + RLS = two independent enforcement layers
- Teachers physically cannot query students/fees/payments tables — RLS returns 0 rows
