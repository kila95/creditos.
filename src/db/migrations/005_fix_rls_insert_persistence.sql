-- ============================================================================
-- SCRIPT SQL DEFINITIVO: 005_fix_rls_insert_persistence.sql
-- Ejecuta todo este bloque en el SQL Editor de tu proyecto Supabase y presiona RUN.
-- ============================================================================

-- 1. CREAR TABLA public.profiles DESDE CERO SI NO EXISTE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL DEFAULT 'Usuario EnRuta',
  name TEXT,
  role TEXT NOT NULL DEFAULT 'collector' CHECK (role IN ('super_admin', 'admin', 'socio', 'collector', 'cobrador', 'cliente')),
  tenant_id TEXT NOT NULL DEFAULT 'org-medellin-01',
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01',
  organization_name TEXT DEFAULT 'Fondo RutaCapital',
  assigned_route_id TEXT DEFAULT 'route-1',
  route_zone TEXT DEFAULT 'Medellín Metropolitana',
  created_by TEXT,
  phone TEXT,
  document_id TEXT,
  plain_password TEXT,
  partner_equity_pct NUMERIC DEFAULT 0,
  capital_invested_cop NUMERIC DEFAULT 0,
  authorized_device_id TEXT,
  device_approved BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar todas las columnas en caso de que exista una versión previa parcial de public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT 'Usuario EnRuta',
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'collector',
  ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'org-medellin-01',
  ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT 'org-medellin-01',
  ADD COLUMN IF NOT EXISTS organization_name TEXT DEFAULT 'Fondo RutaCapital',
  ADD COLUMN IF NOT EXISTS assigned_route_id TEXT DEFAULT 'route-1',
  ADD COLUMN IF NOT EXISTS route_zone TEXT DEFAULT 'Medellín Metropolitana',
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS document_id TEXT,
  ADD COLUMN IF NOT EXISTS plain_password TEXT,
  ADD COLUMN IF NOT EXISTS partner_equity_pct NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capital_invested_cop NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authorized_device_id TEXT,
  ADD COLUMN IF NOT EXISTS device_approved BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. CREAR TABLAS OPERATIVAS COMPLEMENTARIAS SI NO EXISTEN (routes, clients, loans)
CREATE TABLE IF NOT EXISTS public.routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT 'Medellín Metropolitana',
  collector_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  collector_name TEXT,
  organization_id TEXT DEFAULT 'org-medellin-01',
  tenant_id TEXT DEFAULT 'org-medellin-01',
  created_by TEXT,
  status TEXT DEFAULT 'active',
  target_daily_collection NUMERIC DEFAULT 1500000,
  operating_expense_budget NUMERIC DEFAULT 80000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  name TEXT NOT NULL,
  alias TEXT,
  phone TEXT,
  business_type TEXT,
  address TEXT,
  zone TEXT,
  route_id TEXT,
  organization_id TEXT DEFAULT 'org-medellin-01',
  tenant_id TEXT DEFAULT 'org-medellin-01',
  created_by TEXT,
  risk_score INTEGER DEFAULT 80,
  risk_level TEXT DEFAULT 'verde',
  credit_limit NUMERIC DEFAULT 1000000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loans (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES public.clients(id) ON DELETE CASCADE,
  route_id TEXT,
  organization_id TEXT DEFAULT 'org-medellin-01',
  tenant_id TEXT DEFAULT 'org-medellin-01',
  created_by TEXT,
  principal_amount NUMERIC NOT NULL,
  interest_rate NUMERIC NOT NULL DEFAULT 20,
  total_amount NUMERIC NOT NULL,
  daily_quota NUMERIC NOT NULL,
  remaining_balance NUMERIC NOT NULL,
  total_days INTEGER NOT NULL DEFAULT 30,
  paid_days INTEGER DEFAULT 0,
  modality TEXT DEFAULT 'diaria',
  status TEXT DEFAULT 'active',
  start_date TEXT,
  expected_end_date TEXT,
  payment_days JSONB DEFAULT '[1,2,3,4,5,6]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. FUNCIONES AUXILIARES SECURITY DEFINER (Evitan recursión infinita en RLS)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    CASE WHEN (auth.jwt() ->> 'email') = 'estebanochoamesa@gmail.com' THEN 'super_admin' ELSE NULL END,
    'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_org_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(organization_id, tenant_id) FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    (auth.jwt() -> 'user_metadata' ->> 'organization_id'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id'),
    'org-medellin-01'
  );
$$;

-- 4. TRIGGER AUTOMÁTICO: Crea/actualiza la fila en public.profiles apenas se registra en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_org_id TEXT;
  v_full_name TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'collector');
  v_org_id := COALESCE(
    NEW.raw_user_meta_data->>'organization_id',
    NEW.raw_user_meta_data->>'tenant_id',
    'org-medellin-01'
  );
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (
    id, email, full_name, name, role,
    organization_id, tenant_id, organization_name,
    assigned_route_id, route_zone, phone, document_id, created_by, is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_full_name,
    v_role,
    v_org_id,
    COALESCE(NEW.raw_user_meta_data->>'tenant_id', v_org_id),
    COALESCE(NEW.raw_user_meta_data->>'organization_name', 'Fondo RutaCapital'),
    COALESCE(NEW.raw_user_meta_data->>'assigned_route_id', 'route-1'),
    COALESCE(NEW.raw_user_meta_data->>'route_zone', 'Medellín Metropolitana'),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'document_id',
    NEW.raw_user_meta_data->>'created_by',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    name = COALESCE(EXCLUDED.name, public.profiles.name),
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    organization_id = COALESCE(EXCLUDED.organization_id, public.profiles.organization_id),
    tenant_id = COALESCE(EXCLUDED.tenant_id, public.profiles.tenant_id),
    assigned_route_id = COALESCE(EXCLUDED.assigned_route_id, public.profiles.assigned_route_id),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user_profile();

-- 5. HABILITAR RLS Y POLÍTICAS DE LECTURA / ESCRITURA EN public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy"
ON public.profiles FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy"
ON public.profiles FOR INSERT
TO authenticated, anon
WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy"
ON public.profiles FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- 6. HABILITAR RLS Y POLÍTICAS EN routes, clients y loans
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "routes_all_policy" ON public.routes;
CREATE POLICY "routes_all_policy" ON public.routes FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients_all_policy" ON public.clients;
CREATE POLICY "clients_all_policy" ON public.clients FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loans_all_policy" ON public.loans;
CREATE POLICY "loans_all_policy" ON public.loans FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 7. OTORGAR PERMISOS DE ESQUEMA A ROLES DE API DE SUPABASE Y RECARGAR CACHÉ POSTGREST
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.routes TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.clients TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.loans TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
