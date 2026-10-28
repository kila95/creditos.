-- =============================================================================
-- RESTRICCIÓN DE DUPLICADOS EN SUPABASE (SQL)
-- Crea una restricción UNIQUE combinada entre las columnas `phone` (teléfono) y `tenant_id`
-- en la tabla `public.clients`. Esto permite que .upsert() ignore duplicados.
-- =============================================================================

-- 1. Limpiar duplicados previos si existen antes de aplicar la restricción UNIQUE
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY phone, tenant_id
           ORDER BY created_at ASC
         ) as row_num
    FROM public.clients
   WHERE phone IS NOT NULL AND phone != ''
)
DELETE FROM public.clients
 WHERE id IN (SELECT id FROM duplicates WHERE row_num > 1);

-- 2. Agregar restricción UNIQUE combinada entre (phone, tenant_id)
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS uq_clients_phone_tenant_id;

ALTER TABLE public.clients
  ADD CONSTRAINT uq_clients_phone_tenant_id UNIQUE (phone, tenant_id);

-- 3. Índice secundario para optimizar la velocidad de búsqueda en la restricción
CREATE INDEX IF NOT EXISTS idx_clients_phone_tenant_id
  ON public.clients (phone, tenant_id);
