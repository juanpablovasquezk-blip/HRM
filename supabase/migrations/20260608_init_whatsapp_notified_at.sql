-- ============================================================
-- Script de inicialización de notificaciones WhatsApp
-- Ejecutar en: Supabase SQL Editor
-- Propósito:
--   1. Crear columna whatsapp_notified_at
--   2. Marcar TODO el historial como ya notificado
--   3. Dejar pendientes SOLO los cambios de hoy de Carlos Tobar y Pablo Sepúlveda
-- ============================================================

-- PASO 1: Agregar columna (si no existe)
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS whatsapp_notified_at timestamptz DEFAULT NULL;

-- PASO 2: Marcar TODOS los cambios manuales publicados como ya notificados
-- Esto evita que el botón "Notificar Hoy" reenvíe mensajes históricos.
UPDATE public.shift_assignments
SET whatsapp_notified_at = now()
WHERE is_published = true
  AND is_manual    = true;

-- PASO 3: Limpiar solo los cambios de HOY de Carlos Tobar y Pablo Sepúlveda
-- (dejarlos como "no notificados" para que el botón los incluya)
UPDATE public.shift_assignments sa
SET whatsapp_notified_at = NULL
WHERE sa.is_published = true
  AND sa.is_manual    = true
  AND sa.date         = CURRENT_DATE   -- solo fecha de hoy
  AND sa.personnel_id IN (
    SELECT p.id
    FROM public.personnel p
    WHERE
      -- Carlos Christian Tobar
      (lower(p.first_name) LIKE '%carlos%' AND lower(p.last_name_father) LIKE '%tobar%')
      OR
      -- Pablo Sepúlveda (ajusta el apellido si es diferente)
      (lower(p.first_name) LIKE '%pablo%'  AND lower(p.last_name_father) LIKE '%sep%')
  );

-- ============================================================
-- VERIFICACIÓN: muestra qué quedará pendiente de notificar
-- ============================================================
SELECT
  p.first_name || ' ' || p.last_name_father AS trabajador,
  sa.date,
  sh.name AS turno,
  sa.whatsapp_notified_at
FROM public.shift_assignments sa
JOIN public.personnel p  ON p.id  = sa.personnel_id
JOIN public.shifts    sh ON sh.id = sa.shift_id
WHERE sa.is_published = true
  AND sa.is_manual    = true
  AND sa.date         = CURRENT_DATE
ORDER BY p.last_name_father, sa.date;
