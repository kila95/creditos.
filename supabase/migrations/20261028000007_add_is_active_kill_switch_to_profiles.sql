-- =============================================================================
-- 1. BOTÓN DE PÁNICO (KILL SWITCH): COLUMNA IS_ACTIVE EN TABLA PROFILES
-- =============================================================================

-- Agregar columna `is_active` (BOOLEAN por defecto TRUE) a la tabla de perfiles de usuarios/cobradores
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Índice para validación de acceso e intercepción en ProtectedRoute / AuthContext
CREATE INDEX IF NOT EXISTS idx_profiles_is_active
  ON public.profiles (id, is_active);

-- Asegurar que todos los registros vigentes tengan is_active = TRUE por defecto
UPDATE public.profiles
   SET is_active = TRUE
 WHERE is_active IS NULL;
