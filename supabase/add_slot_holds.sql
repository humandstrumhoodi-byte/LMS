-- ═══════════════════════════════════════════════════════════════
-- Invoice-gated slot scheduling + 15-day grace-period holds
-- ═══════════════════════════════════════════════════════════════
-- When a student is enrolled (or re-enrolled) into a class slot and their
-- invoice for that subject is NOT yet paid, the picked slot(s) are not
-- committed to class_schedules/schedule_students right away. Instead each
-- picked slot becomes a "hold" — reserved for that student only, for 15
-- days from the invoice date. If the invoice is paid within the grace
-- period, the hold is converted into a real class slot. If the grace
-- period lapses unpaid, the hold expires and the slot opens back up for
-- any student.

create table if not exists student_slot_holds (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  day_of_week text not null,
  start_time time not null,
  slot_index int not null default 1, -- 1-based, which of the student's paid-for weekly slots this is
  invoice_number text, -- ties the hold back to the invoice that created it, if any
  status text not null default 'held' check (status in ('held','converted','released','cancelled')),
  held_at date not null default current_date,
  grace_until date not null, -- held_at + 15 days; slot is exclusively reserved for this student until then
  converted_schedule_id uuid references class_schedules(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_slot_holds_lookup on student_slot_holds(subject_id, day_of_week, start_time) where status = 'held';
create index if not exists idx_slot_holds_student on student_slot_holds(student_id) where status = 'held';

alter table student_slot_holds enable row level security;

drop policy if exists "slot_holds_select" on student_slot_holds;
create policy "slot_holds_select" on student_slot_holds for select to authenticated
  using (my_role() in ('superadmin','center_manager','teacher'));

drop policy if exists "slot_holds_insert" on student_slot_holds;
create policy "slot_holds_insert" on student_slot_holds for insert to authenticated
  with check (my_role() in ('superadmin','center_manager'));

drop policy if exists "slot_holds_update" on student_slot_holds;
create policy "slot_holds_update" on student_slot_holds for update to authenticated
  using (my_role() in ('superadmin','center_manager'));

drop policy if exists "slot_holds_delete" on student_slot_holds;
create policy "slot_holds_delete" on student_slot_holds for delete to authenticated
  using (my_role() in ('superadmin','center_manager'));

-- One-time reschedule tracking: once a student's class has been moved via an
-- approved reschedule request, they can't request another for that same
-- enrollment (schedule_id, student_id pairing) until it's re-enrolled fresh.
alter table schedule_students add column if not exists reschedule_used_at timestamptz;
