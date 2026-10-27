-- ==============================================================================
-- BLINDAJE MULTI-TENANT Y CONTROL DE ACCESO BASADO EN ROLES (RBAC) - ENRUTA
-- ==============================================================================

-- 1. Extensión para criptografía e integridad
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Función auxiliar segura (SECURITY DEFINER) para obtener el organization_id del usuario activo
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id 
  FROM public.profiles 
  WHERE id = auth.uid()::text 
  LIMIT 1;
$$;

-- 3. Función auxiliar para verificar roles administrativos
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin') 
      AND is_active = true
  );
$$;

-- 4. Restricciones UNIQUE a nivel físico de tabla (Prevención estricta de duplicados)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_profiles_document_id'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT unique_profiles_document_id UNIQUE (document_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_profiles_email'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT unique_profiles_email UNIQUE (email);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_clients_organization_document'
  ) THEN
    ALTER TABLE public.clients ADD CONSTRAINT unique_clients_organization_document UNIQUE (organization_id, document_id);
  END IF;
END $$;

-- ==============================================================================
-- HABILITAR RLS EN TODAS LAS TABLAS DEL NÚCLEO FINANCIERO
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_ledger ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- POLÍTICAS: PROFILES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_tenant" ON public.profiles;
CREATE POLICY "profiles_select_tenant" ON public.profiles
FOR SELECT
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()::text) = 'super_admin'
  OR organization_id = public.get_current_user_tenant_id()
);

DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin" ON public.profiles
FOR INSERT
WITH CHECK (
  public.is_admin_or_super()
  AND (
    organization_id = public.get_current_user_tenant_id()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()::text) = 'super_admin'
  )
);

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles
FOR UPDATE
USING (
  public.is_admin_or_super() AND organization_id = public.get_current_user_tenant_id()
  OR id = auth.uid()::text
)
WITH CHECK (
  organization_id = public.get_current_user_tenant_id()
);

-- ------------------------------------------------------------------------------
-- POLÍTICAS: CLIENTS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "clients_select_policy" ON public.clients;
CREATE POLICY "clients_select_policy" ON public.clients
FOR SELECT
USING (
  organization_id = public.get_current_user_tenant_id()
);

DROP POLICY IF EXISTS "clients_insert_policy" ON public.clients;
CREATE POLICY "clients_insert_policy" ON public.clients
FOR INSERT
WITH CHECK (
  organization_id = public.get_current_user_tenant_id()
  AND (
    public.is_admin_or_super()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()::text) = 'collector'
  )
);

DROP POLICY IF EXISTS "clients_update_policy" ON public.clients;
CREATE POLICY "clients_update_policy" ON public.clients
FOR UPDATE
USING (
  organization_id = public.get_current_user_tenant_id()
)
WITH CHECK (
  organization_id = public.get_current_user_tenant_id()
);

-- ------------------------------------------------------------------------------
-- POLÍTICAS: LOANS (PRÉSTAMOS)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "loans_select_policy" ON public.loans;
CREATE POLICY "loans_select_policy" ON public.loans
FOR SELECT
USING (
  organization_id = public.get_current_user_tenant_id()
);

DROP POLICY IF EXISTS "loans_insert_policy" ON public.loans;
CREATE POLICY "loans_insert_policy" ON public.loans
FOR INSERT
WITH CHECK (
  organization_id = public.get_current_user_tenant_id()
  AND public.is_admin_or_super()
);

DROP POLICY IF EXISTS "loans_update_policy" ON public.loans;
CREATE POLICY "loans_update_policy" ON public.loans
FOR UPDATE
USING (
  organization_id = public.get_current_user_tenant_id()
)
WITH CHECK (
  organization_id = public.get_current_user_tenant_id()
);

-- ------------------------------------------------------------------------------
-- POLÍTICAS: DAILY_LEDGER (PAGOS Y RECAUDOS)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "ledger_select_policy" ON public.daily_ledger;
CREATE POLICY "ledger_select_policy" ON public.daily_ledger
FOR SELECT
USING (
  organization_id = public.get_current_user_tenant_id()
);

DROP POLICY IF EXISTS "ledger_insert_policy" ON public.daily_ledger;
CREATE POLICY "ledger_insert_policy" ON public.daily_ledger
FOR INSERT
WITH CHECK (
  organization_id = public.get_current_user_tenant_id()
);

-- ==============================================================================
-- TABLA DE AUDITORÍA CON ENLACE CRIPTOGRÁFICO HASH-CHAIN (SHA-256)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  target_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  ip_address TEXT,
  gps_location TEXT,
  old_state JSONB,
  new_state JSONB,
  hash TEXT NOT NULL,
  verified_integrity BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs
FOR SELECT
USING (
  public.is_admin_or_super()
);

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
FOR INSERT
WITH CHECK (true);
