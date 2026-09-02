-- ============================================================
-- Migration: Add whatsapp_notified_at to transport_requests
-- ============================================================

ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS whatsapp_notified_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.transport_requests.whatsapp_notified_at IS 'Fecha y hora en que se envió la notificación de transporte vía WhatsApp.';
