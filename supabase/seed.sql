-- Seed Data for HRM Roster Manager
-- WARNING: This script inserts dummy data for development and testing

-- Create a dummy company
INSERT INTO companies (id, name) VALUES 
('c0000000-0000-0000-0000-000000000000', 'Acme Corp Logistics')
ON CONFLICT (id) DO NOTHING;

-- Insert Admin User (replace with an auth.users id when testing locally)
-- For demonstration, we'll assume auth users are created via the UI or Supabase Studio
-- The auto-trigger will create the public.users record.

-- Dummy Areas
INSERT INTO areas (id, company_id, name) VALUES 
('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'Warehouse A'),
('a2000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'Distribution Center')
ON CONFLICT (id) DO NOTHING;

-- Dummy Positions
INSERT INTO positions (id, area_id, name) VALUES 
('p1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'Forklift Operator'),
('p2000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'Picker'),
('p3000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'Driver'),
('p4000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'Dispatcher')
ON CONFLICT (id) DO NOTHING;

-- Dummy Shifts
INSERT INTO shifts (id, company_id, name, start_time, end_time, duration_hours, requires_transport) VALUES 
('s1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'Morning Shift', '08:00', '16:00', 8, true),
('s2000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'Evening Shift', '16:00', '00:00', 8, true),
('s3000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'Night Shift', '00:00', '08:00', 8, false)
ON CONFLICT (id) DO NOTHING;

-- Dummy Personnel
INSERT INTO personnel (id, company_id, first_name, last_name_father, last_name_mother, rut, birth_date, main_position, secondary_positions, prefers_night, avoids_night) VALUES 
('h1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'Roberto', 'Gomez', 'Bolaños', '11.111.111-1', '1990-05-15', 'p1000000-0000-0000-0000-000000000000', ARRAY['p2000000-0000-0000-0000-000000000000'], false, true),
('h2000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'Maria', 'Antonieta', 'De las Nieves', '22.222.222-2', '1992-08-20', 'p2000000-0000-0000-0000-000000000000', ARRAY[]::text[], true, false),
('h3000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'Carlos', 'Villagran', '', '33.333.333-3', '1985-02-10', 'p3000000-0000-0000-0000-000000000000', ARRAY[]::text[], false, false)
ON CONFLICT (id) DO NOTHING;

-- Create some target shift requirements for the current week (example: today and tomorrow)
-- Since CURRENT_DATE is dynamic, we'll insert a procedural block if supported, or just let users do it through the UI
-- For this seed, we assume the user will configure the requirements through "/shifts/requirements"
