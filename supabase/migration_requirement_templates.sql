-- ═══════════════════════════════════════════════════════════════════
-- Tabla de Reglas de Dotación Permanentes (Requirement Templates)
-- Ejecutar en SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS requirement_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  required_count INTEGER NOT NULL DEFAULT 1,
  days_of_week INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 0=Dom,1=Lun...6=Sab
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE requirement_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON requirement_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER set_updated_at_requirement_templates
  BEFORE UPDATE ON requirement_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
