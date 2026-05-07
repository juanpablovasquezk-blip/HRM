-- =============================================================================
-- Migration: Add Document Management System
-- Date: 2026-04-24
-- =============================================================================

-- 1. Create document definitions table
create table if not exists document_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  description text,
  is_mandatory boolean default false,
  requires_expiration boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 2. Add new columns to existing documents table
-- Using do block to avoid errors if columns already exist
do $$ 
begin
    if not exists (select 1 from information_schema.columns where table_name='documents' and column_name='definition_id') then
        alter table documents add column definition_id uuid references document_definitions(id) on delete set null;
    end if;

    if not exists (select 1 from information_schema.columns where table_name='documents' and column_name='status') then
        alter table documents add column status text not null default 'PENDING' 
            check (status in ('PENDING', 'APPROVED', 'REJECTED'));
    end if;

    if not exists (select 1 from information_schema.columns where table_name='documents' and column_name='rejection_reason') then
        alter table documents add column rejection_reason text;
    end if;
end $$;

-- 3. Enable RLS on document_definitions
alter table document_definitions enable row level security;

-- 4. Policies for document_definitions
drop policy if exists "Authenticated can read document definitions" on document_definitions;
create policy "Authenticated can read document definitions"
  on document_definitions for select
  using (auth.uid() is not null);

drop policy if exists "Admin/HR can manage document definitions" on document_definitions;
create policy "Admin/HR can manage document definitions"
  on document_definitions for all
  using (
    exists (
      select 1 from users u where u.id = auth.uid() and u.role in ('ADMIN', 'HR')
    )
  );

-- 5. Update documents policies to allow employees to manage their own uploads
drop policy if exists "Employees can upload their own documents" on documents;
create policy "Employees can upload their own documents"
  on documents for insert
  with check (
    exists (
      select 1 from personnel p
      where p.id = documents.personnel_id
      and p.user_id = auth.uid()
    )
  );

drop policy if exists "Employees can update their own documents" on documents;
create policy "Employees can update their own documents"
  on documents for update
  using (
    exists (
      select 1 from personnel p
      where p.id = documents.personnel_id
      and p.user_id = auth.uid()
    )
  );
