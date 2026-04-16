# 🧩 Workforce & HR Management System - Full Architecture (Final Version)

---

## 1. Overview

This system is a **Workforce & HR Management Platform** designed for logistics and airport operations, supporting multiple companies with shared personnel.

### Core Capabilities:

* Personnel management
* Compliance document tracking
* Advanced shift scheduling (optimization-based)
* Partial recalculation engine
* Operational dashboards
* WhatsApp notifications (UltraMsg)
* PWA for workers

---

## 2. Key Design Decisions

* Single database (shared multi-company model)
* Personnel can work across companies
* Role-based access (simple RBAC)
* Optimization-first scheduling engine
* Partial recalculation enabled
* Freeze window (3-day rule)

---

## 3. Tech Stack

### Frontend

* Next.js (App Router)
* Tailwind CSS
* Shadcn/UI
* React Hook Form + Zod

### Backend

* Supabase (PostgreSQL + Auth + Storage)
* Supabase Edge Functions

### Integrations

* UltraMsg (WhatsApp API)

### Deployment

* Docker
* VPS via Dokploy
* GitHub (version control)

---

## 4. Roles

* ADMIN
* HR
* SUPERVISOR
* USER

---

## 5. Core Modules

1. Personnel Information
2. Documents & Compliance
3. Shift Scheduling
4. Leave Management
5. Dashboard & Reporting
6. Notifications
7. Transport Control

---

## 6. Database Schema (SQL)

```sql
-- COMPANIES
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

-- USERS
create table users (
  id uuid primary key references auth.users(id),
  email text,
  role text check (role in ('ADMIN','HR','SUPERVISOR','USER')),
  company_id uuid references companies(id),
  created_at timestamp default now()
);

-- PERSONNEL
create table personnel (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  company_id uuid references companies(id),

  first_name text,
  last_name_father text,
  last_name_mother text,
  rut text unique,
  birth_date date,

  address jsonb,
  phone text,

  main_position text,
  secondary_positions text[],
  driver_licenses text[],

  prefers_night boolean default false,
  avoids_night boolean default false,

  created_at timestamp default now()
);

-- DOCUMENTS
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),

  type text,
  number text,

  file_url text,
  issue_date date,
  expiration_date date,

  uploaded_by uuid references users(id),
  uploaded_at timestamp default now(),

  created_at timestamp default now()
);

-- AREAS
create table areas (
  id uuid primary key default gen_random_uuid(),
  name text
);

-- POSITIONS
create table positions (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references areas(id),
  name text
);

-- SHIFTS
create table shifts (
  id uuid primary key default gen_random_uuid(),
  name text,
  start_time time,
  end_time time,
  requires_transport boolean
);

-- REQUIREMENTS
create table shift_requirements (
  id uuid primary key default gen_random_uuid(),
  date date,
  area_id uuid,
  position_id uuid,
  required_count int
);

-- ASSIGNMENTS
create table shift_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  shift_id uuid,
  date date,
  area_id uuid,
  position_id uuid,

  status text,
  is_locked boolean default false,
  is_manual boolean default false,
  frozen_by_rule boolean default false,

  created_at timestamp default now()
);

create index idx_assignments_date on shift_assignments(date);

-- LEAVES
create table leaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  type text,
  start_date date,
  end_date date,
  status text
);

-- TRANSPORT LOG
create table transport_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  date date,
  used_company_transport boolean,
  reservation_number text,
  issues text
);
```

---

## 7. Scheduling Engine (Level 3)

### Phases

1. Data preparation
2. Greedy assignment
3. Constraint validation
4. Optimization (swap logic)

---

### Constraints

* Max 40 hours/week
* Minimum 2 days off
* Minimum 10 hours rest
* Birthday = day off
* Respect preferences

---

## 8. Partial Recalculation Engine

### Objective

Recalculate only affected parts without breaking stable assignments.

### Input

```ts
type RecalculationInput = {
  date_range: [Date, Date]
  area_id?: string
  position_id?: string
  affected_user_id?: string
  reason: "sick_leave" | "manual" | "optimization"
  override_freeze?: boolean
}
```

---

### Algorithm

1. Identify impacted assignments
2. Exclude locked/manual/frozen
3. Remove affected
4. Build candidate pool
5. Rank candidates
6. Assign
7. Validate
8. Save & notify

---

## 9. Freeze Window Rule (3 Days)

### Rule

No changes allowed if:

date < today + 3 days

---

### Override

Allowed for:

* ADMIN
* SUPERVISOR

---

### Priority

1. Freeze rule
2. Locked
3. Manual
4. Optimization

---

## 10. Document Logic Engine

### Rules

If TICA exists:

* expiration = TICA - 25 days
* previous cycles = -180 days

If no TICA:

* expiration = upload + 180 days

---

## 11. Notifications

### Events

* Shift published
* Shift changed
* Missing documents
* Expiring documents

---

## 12. Frontend Structure

```
/app
  /dashboard
  /personnel
  /documents
  /shifts
  /leaves
  /reports

/components
  /ui
  /forms
  /tables
  /calendar
  /charts

/lib
  /supabase
  /scheduler
  /notifications
```

---

## 13. PWA (Workers)

Features:

* View shifts
* Notifications
* Upload documents
* Request leave

---

## 14. Deployment

* Docker container
* Dokploy VPS
* Environment variables:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE=
```

---

## 15. Critical Flows

### Shift Generation

1. Load requirements
2. Load availability
3. Run scheduler
4. Save
5. Notify

---

### Sick Leave

1. Register leave
2. Detect impact
3. Recalculate
4. Notify

---

### Document Expiration

1. Daily cron
2. Validate
3. Notify

---

## 16. UX Rules

* Frozen shifts → disabled
* Locked shifts → protected
* Override → warning
* Calendar visual clarity required

---

## 17. MVP Roadmap

### Phase 1

* Personnel
* Documents
* Manual shifts

### Phase 2

* Auto scheduling
* Partial recalculation

### Phase 3

* WhatsApp
* Optimization

---

## 18. Risks

* Scheduling complexity
* Constraint conflicts
* Edge cases
* WhatsApp dependency

---

## 19. Future

* AI scheduling
* Payroll integration
* SaaS model
* Native mobile app

---
