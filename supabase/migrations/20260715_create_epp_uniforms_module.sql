-- Migration: Create EPP and Uniforms Module Tables
-- Date: 2026-07-15

-- 1. Alter companies to add RUT and Giro for dynamic PDF document generation
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS rut TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS giro TEXT;

-- 2. Create epp_inventory table
CREATE TABLE IF NOT EXISTS public.epp_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('UNIFORM', 'EPP')),
  name TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT 'Única',
  price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  invoice_number TEXT DEFAULT '',
  stock_qty INT NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epp_inventory_company ON public.epp_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_epp_inventory_type ON public.epp_inventory(type);
CREATE INDEX IF NOT EXISTS idx_epp_inventory_name_size ON public.epp_inventory(name, size);

-- 3. Create epp_position_requirements table
CREATE TABLE IF NOT EXISTS public.epp_position_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL CHECK (product_type IN ('UNIFORM', 'EPP')),
  product_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  renewal_days INT NOT NULL DEFAULT 180 CHECK (renewal_days > 0),
  size_field TEXT, -- e.g. 'clothing_shoe_size', 'clothing_pants_size_number'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(position_id, product_name)
);

CREATE INDEX IF NOT EXISTS idx_epp_req_position ON public.epp_position_requirements(position_id);

-- 4. Create epp_delivery_events table
CREATE TABLE IF NOT EXISTS public.epp_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL,
  signed_form_url TEXT DEFAULT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epp_del_events_personnel ON public.epp_delivery_events(personnel_id);
CREATE INDEX IF NOT EXISTS idx_epp_del_events_date ON public.epp_delivery_events(delivery_date);

-- 5. Create epp_delivery_items table
CREATE TABLE IF NOT EXISTS public.epp_delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_event_id UUID NOT NULL REFERENCES public.epp_delivery_events(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES public.epp_inventory(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('UNIFORM', 'EPP')),
  size TEXT NOT NULL DEFAULT 'Única',
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  reason TEXT NOT NULL CHECK (reason IN ('FIRST_TIME', 'EXPIRATION', 'DAMAGE', 'PAST_DELIVERY')),
  renewal_days INT NOT NULL CHECK (renewal_days > 0),
  next_delivery_date DATE NOT NULL,
  returned_qty INT NOT NULL DEFAULT 0 CHECK (returned_qty >= 0),
  returned_at DATE DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epp_del_items_event ON public.epp_delivery_items(delivery_event_id);
CREATE INDEX IF NOT EXISTS idx_epp_del_items_dates ON public.epp_delivery_items(next_delivery_date);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.epp_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epp_position_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epp_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epp_delivery_items ENABLE ROW LEVEL SECURITY;

-- 7. Define RLS Policies

-- EPP Inventory: Admin/HR manage all, Supervisors/all can read
CREATE POLICY "Admins/HR can manage inventory" ON public.epp_inventory
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR')
    )
  );

CREATE POLICY "Staff can view inventory" ON public.epp_inventory
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

-- EPP Position Requirements: Admin/HR manage all, all read
CREATE POLICY "Admins/HR can manage requirements" ON public.epp_position_requirements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR')
    )
  );

CREATE POLICY "Anyone authenticated can view requirements" ON public.epp_position_requirements
  FOR SELECT USING (
    auth.uid() IS NOT NULL
  );

-- EPP Delivery Events: Admin/HR manage all, workers read own, staff read all
CREATE POLICY "Admins/HR can manage delivery events" ON public.epp_delivery_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR')
    )
  );

CREATE POLICY "Staff can view all delivery events" ON public.epp_delivery_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

CREATE POLICY "Workers can view own delivery events" ON public.epp_delivery_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = epp_delivery_events.personnel_id AND p.user_id = auth.uid()
    )
  );

-- EPP Delivery Items: Admin/HR manage all, workers read own, staff read all
CREATE POLICY "Admins/HR can manage delivery items" ON public.epp_delivery_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR')
    )
  );

CREATE POLICY "Staff can view all delivery items" ON public.epp_delivery_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

CREATE POLICY "Workers can view own delivery items" ON public.epp_delivery_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.epp_delivery_events ev
      JOIN public.personnel p ON p.id = ev.personnel_id
      WHERE ev.id = epp_delivery_items.delivery_event_id AND p.user_id = auth.uid()
    )
  );
