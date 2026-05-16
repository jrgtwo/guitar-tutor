-- ──────────────────────────────────────────────────────────────────────────
-- 0003 — Teaching workflows
-- ──────────────────────────────────────────────────────────────────────────
-- Relationships: teacher invites student via email or invite link.
-- Mutual opt-in: status goes pending → active when student accepts.
-- Either side can end (status = 'ended').
--
-- Assignments: a teacher-owned template (title, items as jsonb snapshots).
-- Reused across many students via assignment_recipients (per-student state).
--
-- Notes: scoped to a single assignment_recipient row — not general DMs.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── teacher_student_relationships ────────────────────────────────────────
create table public.teacher_student_relationships (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references auth.users(id) on delete cascade,
  student_id      uuid references auth.users(id) on delete set null,
  invite_email    text,
  invite_token    text unique,
  status          text not null default 'pending'
                   check (status in ('pending', 'active', 'ended')),
  invited_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  ended_at        timestamptz,
  student_deleted boolean not null default false,
  -- Preserved aggregate stats so a deleted student still shows up in
  -- the teacher's roster history (anonymized).
  stats_assignments_received int not null default 0,
  stats_assignments_completed int not null default 0,
  constraint either_student_or_invite check (
    student_id is not null or invite_email is not null or invite_token is not null
  )
);

create index tsr_teacher_idx
  on public.teacher_student_relationships (teacher_id, status);

create index tsr_student_idx
  on public.teacher_student_relationships (student_id, status)
  where student_id is not null;

create index tsr_invite_email_idx
  on public.teacher_student_relationships (lower(invite_email))
  where invite_email is not null and status = 'pending';

alter table public.teacher_student_relationships enable row level security;

-- Both sides can see their own relationship rows.
create policy "tsr_read_either_side" on public.teacher_student_relationships
  for select
  using (auth.uid() = teacher_id or auth.uid() = student_id);

-- Teacher creates the row (initial invite).
create policy "tsr_insert_teacher" on public.teacher_student_relationships
  for insert
  with check (auth.uid() = teacher_id);

-- Either side can update (student accepts; either ends the relationship).
create policy "tsr_update_either_side" on public.teacher_student_relationships
  for update
  using (auth.uid() = teacher_id or auth.uid() = student_id);

-- Teacher can delete a pending invite they sent.
create policy "tsr_delete_teacher" on public.teacher_student_relationships
  for delete
  using (auth.uid() = teacher_id and status = 'pending');

-- ─── assignments ──────────────────────────────────────────────────────────
create table public.assignments (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid references auth.users(id) on delete set null,
  title        text not null,
  description  text,
  instructions text,
  items        jsonb not null default '[]'::jsonb,
  orphaned     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index assignments_teacher_idx
  on public.assignments (teacher_id, updated_at desc)
  where teacher_id is not null;

alter table public.assignments enable row level security;

-- Teacher owns and manages.
create policy "assignments_all_teacher" on public.assignments
  for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- NOTE: the "assignments_read_via_recipient" policy is declared further down,
-- AFTER assignment_recipients exists, because Postgres validates the FROM
-- references at policy creation time.

-- ─── assignment_recipients ────────────────────────────────────────────────
create table public.assignment_recipients (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null references public.assignments(id) on delete cascade,
  student_id      uuid not null references auth.users(id) on delete cascade,
  assigned_at     timestamptz not null default now(),
  due_at          timestamptz,
  status          text not null default 'not_started'
                   check (status in ('not_started', 'in_progress', 'complete')),
  started_at      timestamptz,
  completed_at    timestamptz,
  unique (assignment_id, student_id)
);

create index ar_student_idx
  on public.assignment_recipients (student_id, status);

create index ar_assignment_idx
  on public.assignment_recipients (assignment_id, status);

alter table public.assignment_recipients enable row level security;

-- Teacher manages all recipients for their own assignments.
create policy "ar_teacher_full" on public.assignment_recipients
  for all
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.teacher_id = auth.uid()
    )
  );

-- Student reads their own recipient rows.
create policy "ar_student_read" on public.assignment_recipients
  for select
  using (auth.uid() = student_id);

-- Student updates their own status / progress.
create policy "ar_student_update" on public.assignment_recipients
  for update
  using (auth.uid() = student_id);

-- Now that assignment_recipients exists, add the student-side read policy on
-- assignments that references it.
create policy "assignments_read_via_recipient" on public.assignments
  for select
  using (
    exists (
      select 1 from public.assignment_recipients ar
      where ar.assignment_id = id and ar.student_id = auth.uid()
    )
  );

-- ─── assignment_notes ─────────────────────────────────────────────────────
create table public.assignment_notes (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.assignment_recipients(id) on delete cascade,
  author_id    uuid references auth.users(id) on delete set null,
  body         text not null check (length(body) <= 1000),
  reported     boolean not null default false,
  report_count int not null default 0,
  created_at   timestamptz not null default now()
);

create index notes_recipient_idx
  on public.assignment_notes (recipient_id, created_at);

alter table public.assignment_notes enable row level security;

-- Either side of the relationship can read notes on their assignment.
create policy "notes_read_participants" on public.assignment_notes
  for select
  using (
    exists (
      select 1
      from public.assignment_recipients ar
      join public.assignments a on a.id = ar.assignment_id
      where ar.id = recipient_id
        and (a.teacher_id = auth.uid() or ar.student_id = auth.uid())
    )
  );

-- Either side can insert; author must be themselves.
create policy "notes_insert_participants" on public.assignment_notes
  for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from public.assignment_recipients ar
      join public.assignments a on a.id = ar.assignment_id
      where ar.id = recipient_id
        and (a.teacher_id = auth.uid() or ar.student_id = auth.uid())
    )
  );

-- Author can delete their own note.
create policy "notes_delete_author" on public.assignment_notes
  for delete
  using (author_id = auth.uid());

-- Anyone in the conversation can flag (update only the reported fields).
create policy "notes_update_participants" on public.assignment_notes
  for update
  using (
    exists (
      select 1
      from public.assignment_recipients ar
      join public.assignments a on a.id = ar.assignment_id
      where ar.id = recipient_id
        and (a.teacher_id = auth.uid() or ar.student_id = auth.uid())
    )
  );
