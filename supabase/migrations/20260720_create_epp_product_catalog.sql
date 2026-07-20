-- Migration: Create EPP Product Catalog + Link to Position Requirements
-- Date: 2026-07-20
-- Description: Creates a centralized product catalog for EPP/Uniform items.
--   If epp_position_requirements already exists, migrates data and adds FK.

-- 1. Create epp_product_catalog table (no company_id — company is assigned at delivery time)
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

-- 2. Enable RLS on new table
ALTER TABLE public.epp_product_catalog ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_product_catalog' AND policyname = 'Admins/HR can manage catalog') THEN
    CREATE POLICY "Admins/HR can manage catalog"
      ON public.epp_product_catalog
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR')
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epp_product_catalog' AND policyname = 'Anyone authenticated can view catalog') THEN
    CREATE POLICY "Anyone authenticated can view catalog"
      ON public.epp_product_catalog
      FOR SELECT USING (
        auth.uid() IS NOT NULL
      );
  END IF;
END $$;

-- 4. Conditionally migrate data from epp_position_requirements (if it exists)
DO $$
BEGIN
  -- Only run data migration if epp_position_requirements table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'epp_position_requirements'
  ) THEN
    -- Migrate unique products into catalog
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

    -- Add product_catalog_id FK column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'epp_position_requirements' AND column_name = 'product_catalog_id'
    ) THEN
      ALTER TABLE public.epp_position_requirements
        ADD COLUMN product_catalog_id UUID REFERENCES public.epp_product_catalog(id) ON DELETE CASCADE;

      CREATE INDEX IF NOT EXISTS idx_epp_req_catalog ON public.epp_position_requirements(product_catalog_id);
    END IF;

    -- Populate the FK from existing data
    UPDATE public.epp_position_requirements r
    SET product_catalog_id = c.id
    FROM public.epp_product_catalog c
    WHERE r.product_name = c.name
      AND r.product_catalog_id IS NULL;
  END IF;
END $$;
