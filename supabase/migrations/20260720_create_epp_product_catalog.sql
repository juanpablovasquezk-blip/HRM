-- Migration: Create EPP Product Catalog & Ensure All EPP Module Tables Exist
-- Date: 2026-07-20

-- 0. Ensure companies table has rut and giro columns
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS rut TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS giro TEXT;

-- 1. Create epp_inventory table if not exists
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

-- 2. Create epp_product_catalog table
CREATE TABLE IF NOT EXISTS public.epp_product_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL CHECK (product_type IN ('UNIFORM', 'EPP')),
  name TEXT NOT NULL UNIQUE,
  uses_sizes BOOLEAN NOT NULL DEFAULT false,
  size_field TEXT DEFAULT NULL,
  renewal_days INT NOT NULL DEFAULT 180 CHECK (renewal_days > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epp_catalog_type ON public.epp_product_catalog(product_type);
CREATE INDEX IF NOT EXISTS idx_epp_catalog_active ON public.epp_product_catalog(is_active);

-- 3. Create epp_position_requirements table if not exists
CREATE TABLE IF NOT EXISTS public.epp_position_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  product_catalog_id UUID REFERENCES public.epp_product_catalog(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL CHECK (product_type IN ('UNIFORM', 'EPP')),
  product_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  renewal_days INT NOT NULL DEFAULT 180 CHECK (renewal_days > 0),
  size_field TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(position_id, product_name)
);

CREATE INDEX IF NOT EXISTS idx_epp_req_position ON public.epp_position_requirements(position_id);
CREATE INDEX IF NOT EXISTS idx_epp_req_catalog ON public.epp_position_requirements(product_catalog_id);

-- Ensure product_catalog_id column exists if table was created earlier without it
ALTER TABLE public.epp_position_requirements
  ADD COLUMN IF NOT EXISTS product_catalog_id UUID REFERENCES public.epp_product_catalog(id) ON DELETE CASCADE;

-- 4. Create epp_delivery_events table if not exists
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

-- 5. Create epp_delivery_items table if not exists
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

-- 6. Enable RLS
ALTER TABLE public.epp_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epp_product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epp_position_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epp_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epp_delivery_items ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
DO $$
BEGIN
  -- Catalog Policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_product_catalog' AND policyname = 'Admins/HR can manage catalog') THEN
    CREATE POLICY "Admins/HR can manage catalog" ON public.epp_product_catalog FOR ALL USING (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR'))
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_product_catalog' AND policyname = 'Anyone authenticated can view catalog') THEN
    CREATE POLICY "Anyone authenticated can view catalog" ON public.epp_product_catalog FOR SELECT USING (
      auth.uid() IS NOT NULL
    );
  END IF;

  -- Requirements Policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_position_requirements' AND policyname = 'Admins/HR can manage requirements') THEN
    CREATE POLICY "Admins/HR can manage requirements" ON public.epp_position_requirements FOR ALL USING (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR'))
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_position_requirements' AND policyname = 'Anyone authenticated can view requirements') THEN
    CREATE POLICY "Anyone authenticated can view requirements" ON public.epp_position_requirements FOR SELECT USING (
      auth.uid() IS NOT NULL
    );
  END IF;

  -- Inventory Policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_inventory' AND policyname = 'Admins/HR can manage inventory') THEN
    CREATE POLICY "Admins/HR can manage inventory" ON public.epp_inventory FOR ALL USING (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR'))
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_inventory' AND policyname = 'Staff can view inventory') THEN
    CREATE POLICY "Staff can view inventory" ON public.epp_inventory FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR'))
    );
  END IF;

  -- Delivery Events Policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_delivery_events' AND policyname = 'Admins/HR can manage delivery events') THEN
    CREATE POLICY "Admins/HR can manage delivery events" ON public.epp_delivery_events FOR ALL USING (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR'))
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_delivery_events' AND policyname = 'Staff can view all delivery events') THEN
    CREATE POLICY "Staff can view all delivery events" ON public.epp_delivery_events FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR'))
    );
  END IF;

  -- Delivery Items Policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_delivery_items' AND policyname = 'Admins/HR can manage delivery items') THEN
    CREATE POLICY "Admins/HR can manage delivery items" ON public.epp_delivery_items FOR ALL USING (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR'))
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_delivery_items' AND policyname = 'Staff can view all delivery items') THEN
    CREATE POLICY "Staff can view all delivery items" ON public.epp_delivery_items FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR'))
    );
  END IF;
END $$;

-- 8. Data Migration (if epp_position_requirements already has records, link them to catalog)
INSERT INTO public.epp_product_catalog (product_type, name, uses_sizes, size_field, renewal_days)
SELECT DISTINCT ON (product_name)
  product_type,
  product_name,
  (size_field IS NOT NULL AND size_field <> ''),
  CASE WHEN size_field IS NOT NULL AND size_field <> '' THEN size_field ELSE NULL END,
  renewal_days
FROM public.epp_position_requirements
ORDER BY product_name, created_at ASC
ON CONFLICT (name) DO NOTHING;

UPDATE public.epp_position_requirements r
SET product_catalog_id = c.id
FROM public.epp_product_catalog c
WHERE r.product_name = c.name
  AND r.product_catalog_id IS NULL;
