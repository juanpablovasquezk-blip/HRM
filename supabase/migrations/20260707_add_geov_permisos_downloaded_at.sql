-- Migration: Add geov_permisos_downloaded_at to leaves and shift_assignments
-- Purpose: Track which records have already been downloaded in the
--          "Reporte de Permisos GeoVictoria" to avoid uploading duplicates
--          to GeoVictoria when using the "SOLO CAMBIOS" download mode.

ALTER TABLE leaves
ADD COLUMN IF NOT EXISTS geov_permisos_downloaded_at timestamptz DEFAULT NULL;

ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS geov_permisos_downloaded_at timestamptz DEFAULT NULL;
