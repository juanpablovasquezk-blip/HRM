-- Migration: Create EPP Suppliers and Product Supplier Codes
-- Date: 2026-09-11

-- 1. Create epp_suppliers table
CREATE TABLE IF NOT EXISTS public.epp_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  rut TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epp_suppliers_active ON public.epp_suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_epp_suppliers_name ON public.epp_suppliers(name);

-- 2. Create epp_product_supplier_codes table
CREATE TABLE IF NOT EXISTS public.epp_product_supplier_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.epp_suppliers(id) ON DELETE CASCADE,
  product_catalog_id UUID NOT NULL REFERENCES public.epp_product_catalog(id) ON DELETE CASCADE,
  size TEXT NOT NULL DEFAULT 'Única',
  supplier_code TEXT NOT NULL,
  supplier_item_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, product_catalog_id, size)
);

CREATE INDEX IF NOT EXISTS idx_epp_supp_codes_supp ON public.epp_product_supplier_codes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_epp_supp_codes_cat ON public.epp_product_supplier_codes(product_catalog_id);
CREATE INDEX IF NOT EXISTS idx_epp_supp_codes_code ON public.epp_product_supplier_codes(supplier_code);

-- 3. Enable RLS
ALTER TABLE public.epp_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epp_product_supplier_codes ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DO $$
BEGIN
  -- Suppliers Policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_suppliers' AND policyname = 'Admins/HR can manage epp_suppliers') THEN
    CREATE POLICY "Admins/HR can manage epp_suppliers" ON public.epp_suppliers FOR ALL USING (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR'))
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_suppliers' AND policyname = 'Anyone authenticated can view epp_suppliers') THEN
    CREATE POLICY "Anyone authenticated can view epp_suppliers" ON public.epp_suppliers FOR SELECT USING (
      auth.uid() IS NOT NULL
    );
  END IF;

  -- Supplier Codes Policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_product_supplier_codes' AND policyname = 'Admins/HR can manage epp_product_supplier_codes') THEN
    CREATE POLICY "Admins/HR can manage epp_product_supplier_codes" ON public.epp_product_supplier_codes FOR ALL USING (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR'))
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_product_supplier_codes' AND policyname = 'Anyone authenticated can view epp_product_supplier_codes') THEN
    CREATE POLICY "Anyone authenticated can view epp_product_supplier_codes" ON public.epp_product_supplier_codes FOR SELECT USING (
      auth.uid() IS NOT NULL
    );
  END IF;
END $$;
