-- =================================================================================
-- SCRIPT SQL MAESTRO DEFINITIVO: RESETEO QUIRÚRGICO DE `public.profiles` Y `auth.users`
-- Proyecto: EnRuta / RutaCapital - Pega este script completo en el SQL Editor de Supabase
-- =================================================================================

BEGIN;

-- =================================================================================
-- PASO 0: ASEGURAR ESTRUCTURA DE `public.profiles` Y ELIMINAR RESTRICCIONES ROTAS
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'collector',
  tenant_id TEXT,
  organization_id TEXT,
  organization_name TEXT,
  created_by TEXT,
  assigned_route_id TEXT,
  route_zone TEXT,
  phone TEXT,
  document_id TEXT,
  authorized_device_id TEXT,
  device_approved BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar que todas las columnas requeridas existan aunque la tabla haya sido creada antes
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'collector';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_route_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS route_zone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS document_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS authorized_device_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS device_approved BOOLEAN DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Eliminar cualquier Foreign Key secundaria en created_by o tenant_id que bloquee el INSERT
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_created_by_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tenant_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_organization_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Convertir created_by, tenant_id y organization_id a TEXT por si estaban como UUID rígido
ALTER TABLE public.profiles ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
ALTER TABLE public.profiles ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::TEXT;
ALTER TABLE public.profiles ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;


-- =================================================================================
-- PASO 1: LIMPIEZA TOTAL DE TODAS LAS POLÍTICAS RLS EN `public.profiles`
-- (Elimina dinámicamente absolutamente todas las políticas existentes sin importar su nombre)
-- =================================================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles;', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- =================================================================================
-- PASO 2: CORRECCIÓN DE TRIGGERS Y FUNCIONES VINCULADAS A `auth.users`
-- =================================================================================

-- 2.1 Eliminar cualquier trigger previo en auth.users o public.profiles que esté fallando
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_AutoConfirm ON auth.users;
DROP TRIGGER IF EXISTS tr_auto_confirm_auth_user ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;
DROP TRIGGER IF EXISTS on_profile_user_created ON public.profiles;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.auto_confirm_auth_user() CASCADE;

-- 2.2 Trigger BEFORE INSERT en auth.users: Autoconfirma el correo automáticamente a nivel de BD
-- para que ningún Admin o Cobrador quede bloqueado esperando verificación por email.
CREATE OR REPLACE FUNCTION public.auto_confirm_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_auto_confirm_auth_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_auth_user();

-- 2.3 Trigger AFTER INSERT/UPDATE en auth.users: Inserta o sincroniza automáticamente
-- todos los metadatos del usuario en `public.profiles` con privilegios SECURITY DEFINER (salta RLS).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT;
  v_full_name TEXT;
  v_tenant_id TEXT;
  v_org_id TEXT;
  v_org_name TEXT;
  v_created_by TEXT;
  v_route_id TEXT;
  v_route_zone TEXT;
  v_phone TEXT;
  v_doc_id TEXT;
BEGIN
  v_role := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''), 'collector');
  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    split_part(COALESCE(NEW.email, 'usuario@enruta.co'), '@', 1)
  );
  v_org_id := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'organization_id'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'tenant_id'), ''),
    NEW.id::TEXT
  );
  v_tenant_id := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'tenant_id'), ''),
    v_org_id
  );
  v_org_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'organization_name'), ''),
    'Fondo EnRuta'
  );
  v_created_by := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'created_by'), ''),
    NEW.id::TEXT
  );
  v_route_id := NULLIF(TRIM(NEW.raw_user_meta_data->>'assigned_route_id'), '');
  v_route_zone := NULLIF(TRIM(NEW.raw_user_meta_data->>'route_zone'), '');
  v_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
  v_doc_id := NULLIF(TRIM(NEW.raw_user_meta_data->>'document_id'), '');

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    tenant_id,
    organization_id,
    organization_name,
    created_by,
    assigned_route_id,
    route_zone,
    phone,
    document_id,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    LOWER(TRIM(COALESCE(NEW.email, ''))),
    v_full_name,
    v_role,
    v_tenant_id,
    v_org_id,
    v_org_name,
    v_created_by,
    v_route_id,
    v_route_zone,
    v_phone,
    v_doc_id,
    TRUE,
    COALESCE(NEW.created_at, NOW()),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    tenant_id = COALESCE(EXCLUDED.tenant_id, public.profiles.tenant_id),
    organization_id = COALESCE(EXCLUDED.organization_id, public.profiles.organization_id),
    organization_name = COALESCE(EXCLUDED.organization_name, public.profiles.organization_name),
    created_by = COALESCE(EXCLUDED.created_by, public.profiles.created_by),
    assigned_route_id = COALESCE(EXCLUDED.assigned_route_id, public.profiles.assigned_route_id),
    route_zone = COALESCE(EXCLUDED.route_zone, public.profiles.route_zone),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    document_id = COALESCE(EXCLUDED.document_id, public.profiles.document_id),
    is_active = TRUE,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Nunca bloquear la creación en auth.users si ocurre cualquier anomalía secundaria
    RAISE WARNING 'Aviso en handle_new_user para %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- =================================================================================
-- PASO 3: FUNCIONES HELPER SIN RECURSIÓN Y NUEVAS POLÍTICAS RLS LIMPIAS
-- =================================================================================

-- 3.1 Helpers SECURITY DEFINER (leen public.profiles sin disparar RLS recursivo)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    'anon'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(tenant_id, organization_id, id::TEXT) FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id'),
    (auth.jwt() -> 'user_metadata' ->> 'organization_id'),
    auth.uid()::TEXT
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO authenticated, anon, service_role;

-- 3.2 Política SELECT: Lectura limpia para autenticación, SuperAdmins, Admins (su tenant) y propio usuario
CREATE POLICY "profiles_select_policy"
ON public.profiles
FOR SELECT
TO authenticated, anon
USING (
  id = auth.uid()
  OR public.get_my_role() = 'super_admin'
  OR (
    public.get_my_role() = 'admin'
    AND (
      tenant_id = public.get_my_tenant_id()
      OR organization_id = public.get_my_tenant_id()
      OR created_by = auth.uid()::TEXT
    )
  )
  OR auth.role() = 'anon'
);

-- 3.3 Política INSERT para SuperAdmins (Pueden crear Admins y Cobradores en cualquier tenant)
CREATE POLICY "profiles_insert_superadmin_policy"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_my_role() = 'super_admin'
);

-- 3.4 Política INSERT para Admins (Pueden crear Cobradores asignados a su propio tenant_id)
CREATE POLICY "profiles_insert_admin_policy"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_my_role() = 'admin'
  AND role IN ('collector', 'cobrador')
  AND (
    tenant_id = public.get_my_tenant_id()
    OR organization_id = public.get_my_tenant_id()
    OR tenant_id = auth.uid()::TEXT
    OR organization_id = auth.uid()::TEXT
    OR created_by = auth.uid()::TEXT
  )
);

-- 3.5 Política INSERT de Autoregistro / Sincronización (Cuando el cliente aislado inserta su propio UUID)
CREATE POLICY "profiles_insert_self_sync_policy"
ON public.profiles
FOR INSERT
TO authenticated, anon
WITH CHECK (
  id = auth.uid()
  OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = profiles.id)
);

-- 3.6 Política UPDATE: SuperAdmin (todo), Admin (sus cobradores del mismo tenant_id), o propio perfil
CREATE POLICY "profiles_update_policy"
ON public.profiles
FOR UPDATE
TO authenticated, anon
USING (
  id = auth.uid()
  OR public.get_my_role() = 'super_admin'
  OR (
    public.get_my_role() = 'admin'
    AND (
      tenant_id = public.get_my_tenant_id()
      OR organization_id = public.get_my_tenant_id()
      OR created_by = auth.uid()::TEXT
    )
  )
  OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = profiles.id)
)
WITH CHECK (
  id = auth.uid()
  OR public.get_my_role() = 'super_admin'
  OR (
    public.get_my_role() = 'admin'
    AND (
      tenant_id = public.get_my_tenant_id()
      OR organization_id = public.get_my_tenant_id()
      OR created_by = auth.uid()::TEXT
    )
  )
  OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = profiles.id)
);

-- 3.7 Política DELETE: Exclusiva para SuperAdmin y Admin sobre su tenant
CREATE POLICY "profiles_delete_policy"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  public.get_my_role() = 'super_admin'
  OR (
    public.get_my_role() = 'admin'
    AND (
      tenant_id = public.get_my_tenant_id()
      OR organization_id = public.get_my_tenant_id()
      OR created_by = auth.uid()::TEXT
    )
  )
);


-- =================================================================================
-- PASO 4: REPARACIÓN RETROACTIVA DE USUARIOS EXISTENTES EN `auth.users`
-- (Autoconfirma todos los usuarios actuales y sincroniza sus perfiles faltantes)
-- =================================================================================
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW());

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  role,
  tenant_id,
  organization_id,
  organization_name,
  created_by,
  assigned_route_id,
  route_zone,
  phone,
  document_id,
  is_active,
  created_at,
  updated_at
)
SELECT
  u.id,
  LOWER(TRIM(COALESCE(u.email, ''))),
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'name'), ''),
    split_part(COALESCE(u.email, 'usuario@enruta.co'), '@', 1)
  ),
  COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'role'), ''), 'collector'),
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'tenant_id'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'organization_id'), ''),
    u.id::TEXT
  ),
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'organization_id'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'tenant_id'), ''),
    u.id::TEXT
  ),
  COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'organization_name'), ''), 'Fondo EnRuta'),
  COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'created_by'), ''), u.id::TEXT),
  NULLIF(TRIM(u.raw_user_meta_data->>'assigned_route_id'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'route_zone'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'phone'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'document_id'), ''),
  TRUE,
  COALESCE(u.created_at, NOW()),
  NOW()
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = COALESCE(NULLIF(EXCLUDED.email, ''), public.profiles.email),
  full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
  role = COALESCE(NULLIF(EXCLUDED.role, ''), public.profiles.role),
  tenant_id = COALESCE(NULLIF(EXCLUDED.tenant_id, ''), public.profiles.tenant_id),
  organization_id = COALESCE(NULLIF(EXCLUDED.organization_id, ''), public.profiles.organization_id),
  updated_at = NOW();

-- Asegurar que la cuenta principal del propietario quede con rol super_admin
UPDATE public.profiles
SET role = 'super_admin'
WHERE LOWER(email) = 'estebanochoamesa@gmail.com';

-- Recargar caché de esquema de PostgREST en Supabase
NOTIFY pgrst, 'reload schema';

COMMIT;
