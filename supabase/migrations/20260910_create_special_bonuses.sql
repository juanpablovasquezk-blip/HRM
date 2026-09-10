CREATE TABLE public.special_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  paid_month TEXT DEFAULT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_special_bonuses_personnel ON special_bonuses(personnel_id);
CREATE INDEX idx_special_bonuses_date ON special_bonuses(date);
CREATE INDEX idx_special_bonuses_paid_month ON special_bonuses(paid_month);

ALTER TABLE special_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view special_bonuses" ON special_bonuses
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert special_bonuses" ON special_bonuses
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update special_bonuses" ON special_bonuses
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Users can delete special_bonuses" ON special_bonuses
  FOR DELETE USING (auth.role() = 'authenticated');
