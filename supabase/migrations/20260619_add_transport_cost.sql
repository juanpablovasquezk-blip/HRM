-- =============================================================================
-- Migration: Add cost field to transport_requests
-- Date: 2026-06-19
-- Purpose: Store the transport cost imported from the provider's monthly Excel
-- =============================================================================

ALTER TABLE transport_requests
  ADD COLUMN IF NOT EXISTS cost numeric(10,2) DEFAULT NULL;

COMMENT ON COLUMN transport_requests.cost IS 'Costo del servicio importado desde el reporte mensual del proveedor de transporte (ej: Transvip). Columna AH del Excel.';
