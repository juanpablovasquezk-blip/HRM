-- =============================================================================
-- Workforce & HR Management System — Full Database Schema
-- Compatible with Supabase (PostgreSQL)
-- =============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================================================
-- COMPANIES
-- =============================================================================
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- =============================================================================
-- USERS (linked to Supabase Auth)
-- =============================================================================
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null check (role in ('ADMIN','HR','SUPERVISOR','USER')) default 'USER',
  company_id uuid references companies(id) on delete set null,
  avatar_url text,
  phone text,
  created_at timestamptz default now()
);

create index idx_users_role on users(role);
create index idx_users_company on users(company_id);

-- =============================================================================
-- PERSONNEL
-- =============================================================================
create table personnel (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  company_id uuid not null references companies(id) on delete cascade,

  first_name text not null,
  last_name_father text not null,
  last_name_mother text not null default '',
  rut text not null unique,
  email text,
  birth_date date not null,

  address jsonb default '{}',
  phone text default '',

  main_position text,
  secondary_positions text[] default '{}',
  driver_licenses text[] default '{}',

  prefers_night boolean default false,
  avoids_night boolean default false,
  is_active boolean default true,

  created_at timestamptz default now()
);

create index idx_personnel_company on personnel(company_id);
create index idx_personnel_rut on personnel(rut);
create index idx_personnel_user on personnel(user_id);
create index idx_personnel_active on personnel(is_active);

-- =============================================================================
-- DOCUMENTS
-- =============================================================================
create table documents (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references personnel(id) on delete cascade,

  type text not null,
  number text default '',

  file_url text not null,
  issue_date date,
  expiration_date date,
  tica_date date,

  uploaded_by uuid references users(id) on delete set null,
  uploaded_at timestamptz default now(),

  created_at timestamptz default now()
);

create index idx_documents_personnel on documents(personnel_id);
create index idx_documents_expiration on documents(expiration_date);
create index idx_documents_type on documents(type);

-- =============================================================================
-- AREAS
-- =============================================================================
create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz default now(),
  unique(name, company_id)
);

-- =============================================================================
-- POSITIONS
-- =============================================================================
create table positions (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique(name, area_id)
);

create index idx_positions_area on positions(area_id);

-- =============================================================================
-- SHIFTS
-- =============================================================================
create table shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  duration_hours numeric(4,2) not null default 0,
  requires_transport boolean default false,
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz default now()
);

create index idx_shifts_company on shifts(company_id);

-- =============================================================================
-- SHIFT REQUIREMENTS (daily demand)
-- =============================================================================
create table shift_requirements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift_id uuid not null references shifts(id) on delete cascade,
  area_id uuid not null references areas(id) on delete cascade,
  position_id uuid not null references positions(id) on delete cascade,
  required_count int not null default 1 check (required_count > 0),
  created_at timestamptz default now(),
  unique(date, shift_id, area_id, position_id)
);

create index idx_requirements_date on shift_requirements(date);
create index idx_requirements_area on shift_requirements(area_id);

-- =============================================================================
-- SHIFT ASSIGNMENTS
-- =============================================================================
create table shift_assignments (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references personnel(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete cascade,
  date date not null,
  area_id uuid not null references areas(id) on delete cascade,
  position_id uuid not null references positions(id) on delete cascade,

  status text not null default 'scheduled'
    check (status in ('scheduled','confirmed','completed','cancelled','no_show')),

  is_locked boolean default false,
  is_manual boolean default false,
  frozen_by_rule boolean default false,

  override_by uuid references users(id) on delete set null,
  override_reason text,

  created_at timestamptz default now(),

  -- Prevent duplicate assignments (same person, same date, same shift)
  unique(personnel_id, date, shift_id)
);

create index idx_assignments_date on shift_assignments(date);
create index idx_assignments_personnel on shift_assignments(personnel_id);
create index idx_assignments_area on shift_assignments(area_id);
create index idx_assignments_status on shift_assignments(status);

-- =============================================================================
-- LEAVES
-- =============================================================================
create table leaves (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references personnel(id) on delete cascade,
  type text not null check (type in ('vacation','sick','personal','maternity','other')),
  start_date date not null,
  end_date date not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  reason text,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz default now(),

  check (end_date >= start_date)
);

create index idx_leaves_personnel on leaves(personnel_id);
create index idx_leaves_dates on leaves(start_date, end_date);
create index idx_leaves_status on leaves(status);

-- =============================================================================
-- TRANSPORT LOGS
-- =============================================================================
create table transport_logs (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references personnel(id) on delete cascade,
  date date not null,
  used_company_transport boolean default false,
  reservation_number text,
  issues text,
  logged_by uuid not null references users(id) on delete set null,
  created_at timestamptz default now()
);

create index idx_transport_date on transport_logs(date);
create index idx_transport_personnel on transport_logs(personnel_id);

-- =============================================================================
-- NOTIFICATIONS (in-app)
-- =============================================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in (
    'shift_published','shift_changed','document_expiring',
    'document_expired','leave_approved','leave_rejected','general'
  )),
  title text not null,
  message text not null,
  is_read boolean default false,
  data jsonb,
  created_at timestamptz default now()
);

create index idx_notifications_user on notifications(user_id);
create index idx_notifications_read on notifications(is_read);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
alter table companies enable row level security;
alter table users enable row level security;
alter table personnel enable row level security;
alter table documents enable row level security;
alter table areas enable row level security;
alter table positions enable row level security;
alter table shifts enable row level security;
alter table shift_requirements enable row level security;
alter table shift_assignments enable row level security;
alter table leaves enable row level security;
alter table transport_logs enable row level security;
alter table notifications enable row level security;

-- Users can read their own profile
create policy "Users can read own profile"
  on users for select
  using (auth.uid() = id);

-- Admins and HR can read all users
create policy "Admin/HR can read all users"
  on users for select
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
      and u.role in ('ADMIN', 'HR')
    )
  );

-- Admins can manage all users
create policy "Admin can manage users"
  on users for all
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
      and u.role = 'ADMIN'
    )
  );

-- Personnel: readable by ADMIN, HR, SUPERVISOR
create policy "Staff can read personnel"
  on personnel for select
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
      and u.role in ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

-- Personnel: users can read their own record
create policy "Users can read own personnel record"
  on personnel for select
  using (user_id = auth.uid());

-- ADMIN/HR can manage personnel
create policy "Admin/HR can manage personnel"
  on personnel for all
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
      and u.role in ('ADMIN', 'HR')
    )
  );

-- Companies, Areas, Positions, Shifts: readable by all authenticated
create policy "Authenticated can read companies"
  on companies for select
  using (auth.uid() is not null);

create policy "Authenticated can read areas"
  on areas for select
  using (auth.uid() is not null);

create policy "Authenticated can read positions"
  on positions for select
  using (auth.uid() is not null);

create policy "Authenticated can read shifts"
  on shifts for select
  using (auth.uid() is not null);

-- Admins can manage companies, areas, positions, shifts
create policy "Admin can manage companies"
  on companies for all
  using (
    exists (
      select 1 from users u where u.id = auth.uid() and u.role = 'ADMIN'
    )
  );

create policy "Admin/HR can manage areas"
  on areas for all
  using (
    exists (
      select 1 from users u where u.id = auth.uid() and u.role in ('ADMIN', 'HR')
    )
  );

create policy "Admin/HR can manage positions"
  on positions for all
  using (
    exists (
      select 1 from users u where u.id = auth.uid() and u.role in ('ADMIN', 'HR')
    )
  );

create policy "Admin/HR can manage shifts"
  on shifts for all
  using (
    exists (
      select 1 from users u where u.id = auth.uid() and u.role in ('ADMIN', 'HR')
    )
  );

-- Shift assignments: readable by all staff; users can see own
create policy "Staff can read assignments"
  on shift_assignments for select
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
      and u.role in ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

create policy "Users can read own assignments"
  on shift_assignments for select
  using (
    exists (
      select 1 from personnel p
      where p.id = shift_assignments.personnel_id
      and p.user_id = auth.uid()
    )
  );

-- Notifications: users can only see their own
create policy "Users can read own notifications"
  on notifications for select
  using (user_id = auth.uid());

create policy "Users can update own notifications"
  on notifications for update
  using (user_id = auth.uid());

-- Leaves: users can see own, staff can see all
create policy "Users can read own leaves"
  on leaves for select
  using (
    exists (
      select 1 from personnel p
      where p.id = leaves.personnel_id
      and p.user_id = auth.uid()
    )
  );

create policy "Staff can read all leaves"
  on leaves for select
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
      and u.role in ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

-- Documents: users can see own, staff can see all
create policy "Users can read own documents"
  on documents for select
  using (
    exists (
      select 1 from personnel p
      where p.id = documents.personnel_id
      and p.user_id = auth.uid()
    )
  );

create policy "Staff can read all documents"
  on documents for select
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
      and u.role in ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'USER')
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function calculate_shift_duration()
returns trigger as $$
declare
  raw_hours numeric;
begin
  if new.end_time > new.start_time then
    raw_hours := extract(epoch from (new.end_time - new.start_time)) / 3600.0;
  else
    -- Overnight shift
    raw_hours := extract(epoch from (('24:00:00'::time - new.start_time) + new.end_time)) / 3600.0;
  end if;
  
  -- Restar 1 hora de colación (Lunch break) automáticamente a turnos mayores a 1 hora
  if raw_hours > 1.0 then
    new.duration_hours := raw_hours - 1.0;
  else
    new.duration_hours := raw_hours;
  end if;

  return new;
end;
$$ language plpgsql;

create or replace trigger calc_shift_duration
  before insert or update of start_time, end_time on shifts
  for each row execute function calculate_shift_duration();

-- =============================================================================
-- STORAGE BUCKETS
-- =============================================================================
-- Run these in Supabase dashboard or via API:
-- insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
