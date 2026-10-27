-- ============================================================================
-- MIGRACIÓN 005: CORRECCIÓN DEFINITIVA DE RLS (INSERT/SELECT) Y PERSISTENCIA
-- SaaS EnRuta - Garantía de Escritura en profiles, routes, clients y loans
-- ============================================================================

-- 1. Asegurar columnas necesarias en public.profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'collector',
  organization_id TEXT,
  tenant_id TEXT,
  organization_name TEXT,
  created_by TEXT,
  assigned_route_id TEXT,
  route_zone TEXT,
  phone TEXT,
  document_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_route_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS route_zone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS document_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 2. Asegurar columnas necesarias en public.routes, public.clients y public.loans
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS collector_id TEXT;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS collector_name TEXT;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS business_type TEXT;

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS modality TEXT DEFAULT 'diaria';
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS payment_days JSONB DEFAULT '[1,2,3,4,5,6]'::jsonb;

-- 3. Función Auxiliar SECURITY DEFINER para obtener el tenant_id u organization_id del usuario actual
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(tenant_id, organization_id, id::text) FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id'),
    (auth.jwt() -> 'user_metadata' ->> 'organization_id'),
    auth.uid()::text
  );
$$;

-- 4. Trigger SECURITY DEFINER: Sincronización automática auth.users -> public.profiles
-- Garantiza que al crear un Admin o Cobrador en Auth, su fila en public.profiles se cree sin bloqueo RLS
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_tenant_id TEXT;
  v_org_id TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'collector');
  v_org_id := COALESCE(NEW.raw_user_meta_data->>'organization_id', NEW.raw_user_meta_data->>'tenant_id', NEW.id::text);
  v_tenant_id := COALESCE(NEW.raw_user_meta_data->>'tenant_id', v_org_id);

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    organization_id,
    tenant_id,
    organization_name,
    created_by,
    assigned_route_id,
    route_zone,
    phone,
    document_id,
    is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_role,
    v_org_id,
    v_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'organization_name', 'Fondo EnRuta'),
    COALESCE(NEW.raw_user_meta_data->>'created_by', NEW.id::text),
    NEW.raw_user_meta_data->>'assigned_route_id',
    NEW.raw_user_meta_data->>'route_zone',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'document_id',
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    organization_id = COALESCE(EXCLUDED.organization_id, public.profiles.organization_id),
    tenant_id = COALESCE(EXCLUDED.tenant_id, public.profiles.tenant_id),
    organization_name = COALESCE(EXCLUDED.organization_name, public.profiles.organization_name),
    assigned_route_id = COALESCE(EXCLUDED.assigned_route_id, public.profiles.assigned_route_id),
    route_zone = COALESCE(EXCLUDED.route_zone, public.profiles.route_zone),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    document_id = COALESCE(EXCLUDED.document_id, public.profiles.document_id),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_sync_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user_profile();

-- ============================================================================
-- 5. POLÍTICAS RLS EN TABLA public.profiles (LECTURA Y ESCRITURA DE PERFILES)
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

-- SELECT: El usuario ve su propio perfil, el SuperAdmin ve todos, y el Admin ve los cobradores de su tenant
CREATE POLICY "profiles_select_policy"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR created_by = auth.uid()::text
  OR tenant_id = auth.uid()::text
  OR tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR (auth.jwt() ->> 'email') IN ('estebanochoamesa@gmail.com', 'superadmin@rutacapital.co')
);

-- INSERT: El Admin puede insertar perfiles de cobradores pasando su tenant_id / auth.uid(), y SuperAdmin puede crear Admins
CREATE POLICY "profiles_insert_policy"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  OR created_by = auth.uid()::text
  OR tenant_id = auth.uid()::text
  OR tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR (auth.jwt() ->> 'email') IN ('estebanochoamesa@gmail.com', 'superadmin@rutacapital.co')
);

-- UPDATE: El usuario, su Admin creador o el SuperAdmin pueden actualizar el perfil
CREATE POLICY "profiles_update_policy"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  OR created_by = auth.uid()::text
  OR tenant_id = auth.uid()::text
  OR tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR (auth.jwt() ->> 'email') IN ('estebanochoamesa@gmail.com', 'superadmin@rutacapital.co')
)
WITH CHECK (
  id = auth.uid()
  OR created_by = auth.uid()::text
  OR tenant_id = auth.uid()::text
  OR tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR (auth.jwt() ->> 'email') IN ('estebanochoamesa@gmail.com', 'superadmin@rutacapital.co')
);

-- ============================================================================
-- 6. POLÍTICAS RLS EN TABLA public.clients (CREACIÓN Y LECTURA DE CLIENTES)
-- ============================================================================
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_tenant_select" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_update" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_policy" ON public.clients;

CREATE POLICY "clients_tenant_select"
ON public.clients
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR tenant_id = auth.uid()::text
  OR created_by = auth.uid()::text
);

CREATE POLICY "clients_tenant_insert"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR tenant_id = auth.uid()::text
  OR created_by = auth.uid()::text
);

CREATE POLICY "clients_tenant_update"
ON public.clients
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR tenant_id = auth.uid()::text
  OR created_by = auth.uid()::text
)
WITH CHECK (
  tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR tenant_id = auth.uid()::text
  OR created_by = auth.uid()::text
);

-- ============================================================================
-- 7. POLÍTICAS RLS EN TABLA public.loans (CREACIÓN Y LECTURA DE PRÉSTAMOS)
-- ============================================================================
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loans_tenant_select" ON public.loans;
DROP POLICY IF EXISTS "loans_tenant_insert" ON public.loans;
DROP POLICY IF EXISTS "loans_tenant_update" ON public.loans;

CREATE POLICY "loans_tenant_select"
ON public.loans
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR tenant_id = auth.uid()::text
  OR created_by = auth.uid()::text
);

CREATE POLICY "loans_tenant_insert"
ON public.loans
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR tenant_id = auth.uid()::text
  OR created_by = auth.uid()::text
);

CREATE POLICY "loans_tenant_update"
ON public.loans
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_current_user_tenant_id()
  OR organization_id = public.get_current_user_tenant_id()
  OR tenant_id = auth.uid()::text
  OR created_by = auth.uid()::text
);

-- ============================================================================
-- 8. POLÍTICAS RLS EN TABLA public.routes
-- ============================================================================
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "routes_tenant_select" ON public.routes;
DROP POLICY IF EXISTS "routes_tenant_insert" ON public.routes;
DROP POLICY IF EXISTS "routes_tenant_update" ON public.routes;

CREATE POLICY "routes_tenant_select"
ON public.routes
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "routes_tenant_insert"
ON public.routes
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "routes_tenant_update"
ON public.routes
FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated');
