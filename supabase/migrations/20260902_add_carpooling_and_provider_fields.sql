-- Add columns for carpooling (colleague pickup) and alternative transport providers
ALTER TABLE transport_requests 
ADD COLUMN IF NOT EXISTS driver_personnel_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS provider_name TEXT,
ADD COLUMN IF NOT EXISTS parent_request_id UUID REFERENCES transport_requests(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_transport_requests_driver_personnel_id ON transport_requests(driver_personnel_id);
CREATE INDEX IF NOT EXISTS idx_transport_requests_parent_request_id ON transport_requests(parent_request_id);
