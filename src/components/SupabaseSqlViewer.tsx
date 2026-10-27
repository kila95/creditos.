import React, { useState } from 'react';
import { 
  Database, 
  Copy, 
  Check, 
  Terminal, 
  Layers, 
  ShieldCheck, 
  Download, 
  Lock, 
  UserCheck 
} from 'lucide-react';

export const SUPABASE_SQL_SCRIPT = `-- ==============================================================================
-- SISTEMA DE MICROCRÉDITOS Y LIQUIDEZ DIARIA (RUTACAPITAL OS)
-- MOTOR DE BASE DE DATOS SUPABASE / POSTGRESQL (MEDELLÍN CORE)
-- ARQUITECTURA MULTI-TENANT CON AISLAMIENTO ESTRICTO DE INQUILINOS (RLS)
-- Y BLOQUEO FINANCIERO TOTAL PARA EL PROVEEDOR SAAS (SUPER_ADMIN)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TIPOS ENUMERADOS & JERARQUÍA DE ROLES DE 3 NIVELES
-- ==============================================================================
-- Nivel 1: 'super_admin' (Proveedor SaaS - SOLO Soporte Técnico y Facturación por Rutas Activas;
--                         ESTRICTAMENTE PROHIBIDO INSERT/UPDATE/DELETE o lectura financiera confidencial)
-- Nivel 2: 'admin'       (Administrador de Inquilino/Fondo - Aislado por organization_id / tenant_id)
-- Nivel 3: 'collector'   (Cobrador de Ruta - Aislado por organization_id + assigned_route_id)
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'collector', 'socio', 'cobrador', 'cliente');
CREATE TYPE route_status AS ENUM ('activa', 'suspendida', 'en_auditoria');
CREATE TYPE client_risk_tier AS ENUM ('A_excelente', 'B_promedio', 'C_alto_riesgo', 'D_mora_critica', 'X_vetado');
CREATE TYPE loan_status AS ENUM ('activo', 'liquidado', 'mora_severa', 'castigado', 'refinanciado');
CREATE TYPE payment_frequency AS ENUM ('diario_habil', 'diario_corrido', 'semanal', 'quincenal', 'mensual');
CREATE TYPE payment_method AS ENUM ('efectivo', 'nequi', 'daviplata', 'transferencia_bancaria');
CREATE TYPE shift_status AS ENUM ('abierta', 'cerrada', 'auditada_ok', 'auditada_con_diferencia');
CREATE TYPE expense_category AS ENUM (
  'combustible_moto', 
  'mantenimiento_moto', 
  'alimentacion_viaticos', 
  'telefonia_datos', 
  'peajes_parqueaderos', 
  'contingencia_territorial', 
  'otros'
);

-- ==============================================================================
-- 2. TABLA DE PERFILES VINCULADA A AUTH.USERS (JERARQUÍA MULTI-TENANT)
-- ==============================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'collector',
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01', -- tenant_id que aísla a cada Admin y sus Cobradores
  organization_name TEXT DEFAULT 'Fondo RutaCapital',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_route_id TEXT,                                 -- Ej: 'route-1' (Ruta asignada al collector)
  route_zone TEXT,                                        -- Ej: 'Centro / El Hueco', 'Laureles / Estadio', etc.
  phone TEXT,
  partner_equity_pct NUMERIC(5, 2) DEFAULT 0.00 CHECK (partner_equity_pct >= 0 AND partner_equity_pct <= 100),
  capital_invested_cop NUMERIC(14, 2) DEFAULT 0.00 CHECK (capital_invested_cop >= 0),
  document_id TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FUNCIÓN HELPER 1: OBTENER EL ROL DEL USUARIO ACTUAL (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- FUNCIÓN HELPER 2: VALIDAR SI ES SUPER_ADMIN (PROVEEDOR SAAS - SOLO SOPORTE Y FACTURACIÓN)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role = 'super_admin' 
      AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- FUNCIÓN HELPER 3: VALIDAR SI ES ADMIN DE INQUILINO (NIVEL 2 - EXCLUYE ESTRICTAMENTE A SUPER_ADMIN)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role = 'admin' 
      AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- FUNCIÓN HELPER 4: OBTENER EL TENANT_ID (ORGANIZATION_ID) DEL USUARIO AUTENTICADO
CREATE OR REPLACE FUNCTION public.get_current_user_org_id()
RETURNS TEXT AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- FUNCIÓN HELPER 5: OBTENER LA RUTA ASIGNADA AL COLLECTOR AUTENTICADO (NIVEL 3)
CREATE OR REPLACE FUNCTION public.get_collector_assigned_route()
RETURNS TEXT AS $$
  SELECT assigned_route_id FROM public.profiles 
  WHERE id = auth.uid() 
    AND role IN ('collector', 'cobrador') 
    AND is_active = TRUE;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- FUNCIÓN HELPER 6: VALIDAR SI ES ADMIN O SOCIO DEL INQUILINO (EXCLUYE ESTRICTAMENTE A SUPER_ADMIN)
CREATE OR REPLACE FUNCTION public.is_admin_or_socio()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role IN ('admin', 'socio') 
      AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- TRIGGER AUTOMÁTICO PARA SINCRONIZAR AUTH.USERS -> PUBLIC.PROFILES CON TENANT_ID Y ZONA DE COBRO
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    organization_id,
    organization_name,
    created_by,
    assigned_route_id,
    route_zone
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'collector'::user_role),
    COALESCE(NEW.raw_user_meta_data->>'organization_id', 'org-medellin-01'),
    COALESCE(NEW.raw_user_meta_data->>'organization_name', 'Fondo RutaCapital'),
    NULLIF(NEW.raw_user_meta_data->>'created_by', '')::uuid,
    NEW.raw_user_meta_data->>'assigned_route_id',
    NEW.raw_user_meta_data->>'route_zone'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    organization_id = EXCLUDED.organization_id,
    organization_name = EXCLUDED.organization_name,
    created_by = EXCLUDED.created_by,
    assigned_route_id = EXCLUDED.assigned_route_id,
    route_zone = EXCLUDED.route_zone;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 3. RUTAS OPERATIVAS (Comunas / Sectores vinculados a organization_id / tenant_id)
-- ==============================================================================
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,                       -- Ej: 'RUTA-MED-01'
  name VARCHAR(100) NOT NULL,                             -- Ej: 'Comuna 13 - San Javier'
  city VARCHAR(50) NOT NULL DEFAULT 'Medellín',
  zone_sector VARCHAR(100) NOT NULL,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01', -- tenant_id del Admin propietario
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  base_floating_capital NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (base_floating_capital >= 0),
  fixed_daily_opex NUMERIC(12, 2) NOT NULL DEFAULT 45000.00,
  max_portfolio_limit NUMERIC(14, 2) NOT NULL DEFAULT 50000000.00,
  target_recovery_rate NUMERIC(5, 2) NOT NULL DEFAULT 95.00,
  status route_status NOT NULL DEFAULT 'activa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. OPERADORES Y COBRADORES DE RUTA (Vinculados al organization_id del Admin)
-- ==============================================================================
CREATE TABLE public.collectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_route_id UUID REFERENCES public.routes(id) ON DELETE RESTRICT,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  document_id VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  device_imei VARCHAR(64),
  max_daily_disbursement_limit NUMERIC(12, 2) NOT NULL DEFAULT 2000000.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 5. CLIENTES / DEUDORES (Aislados por organization_id / tenant_id y route_id)
-- ==============================================================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01', -- tenant_id obligatorio para aislamiento RLS
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  document_type VARCHAR(10) DEFAULT 'CC',
  document_number VARCHAR(60) DEFAULT NULL, -- Campo opcional: no bloquea la creación de clientes en calle
  first_name VARCHAR(60) NOT NULL,
  last_name VARCHAR(60) NOT NULL,
  trade_name VARCHAR(120) NOT NULL,
  business_category VARCHAR(60) NOT NULL,
  physical_address TEXT NOT NULL,
  neighborhood_sector VARCHAR(80) NOT NULL,
  gps_lat NUMERIC(10, 7),
  gps_lng NUMERIC(10, 7),
  phone_primary VARCHAR(20) NOT NULL,
  phone_secondary VARCHAR(20),
  guarantor_name VARCHAR(120),
  guarantor_doc VARCHAR(30),
  guarantor_phone VARCHAR(20),
  risk_tier client_risk_tier NOT NULL DEFAULT 'B_promedio',
  consecutive_paid_loans INTEGER NOT NULL DEFAULT 0,
  has_preventive_block BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 6. SESIONES DE CAJA Y ARQUEO CIEGO (CASH_DRAWER_SESSIONS)
-- ==============================================================================
CREATE TABLE public.cash_drawer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  collector_id UUID NOT NULL REFERENCES public.collectors(id) ON DELETE RESTRICT,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01', -- tenant_id obligatorio para aislamiento RLS
  opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (opening_cash >= 0),
  cash_collected_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cash_collected_total >= 0),
  digital_collected_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (digital_collected_total >= 0),
  cash_disbursed_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cash_disbursed_total >= 0),
  operating_expenses_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (operating_expenses_total >= 0),
  expected_closing_cash NUMERIC(12, 2) GENERATED ALWAYS AS (
    opening_cash + cash_collected_total - cash_disbursed_total - operating_expenses_total
  ) STORED,
  actual_closing_cash NUMERIC(12, 2) DEFAULT NULL,
  cash_discrepancy NUMERIC(12, 2) DEFAULT 0.00,
  status shift_status NOT NULL DEFAULT 'abierta',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  notes TEXT,
  CONSTRAINT uq_route_shift_date UNIQUE (route_id, shift_date)
);

-- ==============================================================================
-- 7. PRÉSTAMOS ACTIVOS (LOANS - Aislados por organization_id / tenant_id)
-- ==============================================================================
CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_code VARCHAR(30) NOT NULL UNIQUE,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  collector_id UUID NOT NULL REFERENCES public.collectors(id) ON DELETE RESTRICT,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01', -- tenant_id obligatorio para aislamiento RLS
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  principal_amount NUMERIC(12, 2) NOT NULL CHECK (principal_amount > 0),
  interest_rate_percent NUMERIC(5, 2) NOT NULL CHECK (interest_rate_percent >= 0),
  total_interest_amount NUMERIC(12, 2) NOT NULL CHECK (total_interest_amount >= 0),
  total_debt_amount NUMERIC(12, 2) NOT NULL CHECK (total_debt_amount = principal_amount + total_interest_amount),
  term_days INTEGER NOT NULL CHECK (term_days > 0),
  payment_freq payment_frequency NOT NULL DEFAULT 'diario_habil',
  installment_amount NUMERIC(12, 2) NOT NULL CHECK (installment_amount > 0),
  disbursed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  total_collected_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_collected_amount >= 0),
  remaining_balance NUMERIC(12, 2) NOT NULL CHECK (remaining_balance >= 0),
  installments_paid_count INTEGER NOT NULL DEFAULT 0,
  days_overdue INTEGER NOT NULL DEFAULT 0 CHECK (days_overdue >= 0),
  status loan_status NOT NULL DEFAULT 'activo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. PAGOS Y LEDGER INMUTABLE DE COBROS DIARIOS (PAYMENTS & DAILY_LEDGER)
-- ==============================================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number VARCHAR(40) NOT NULL UNIQUE,
  session_id UUID REFERENCES public.cash_drawer_sessions(id) ON DELETE RESTRICT,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  collector_id UUID REFERENCES public.collectors(id) ON DELETE RESTRICT,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01', -- tenant_id obligatorio para aislamiento RLS
  amount_received NUMERIC(12, 2) NOT NULL CHECK (amount_received > 0),
  principal_portion NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (principal_portion >= 0),
  interest_portion NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (interest_portion >= 0),
  pre_balance NUMERIC(12, 2) NOT NULL,
  post_balance NUMERIC(12, 2) NOT NULL CHECK (post_balance <= pre_balance),
  payment_channel payment_method NOT NULL DEFAULT 'efectivo',
  gps_lat NUMERIC(10, 7),
  gps_lng NUMERIC(10, 7),
  collection_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  entry_hash TEXT GENERATED ALWAYS AS (
    encode(digest(id::text || loan_id::text || amount_received::text || collection_timestamp::text, 'sha256'), 'hex')
  ) STORED
);

CREATE TABLE public.daily_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number VARCHAR(40) NOT NULL UNIQUE,
  shift_id UUID NOT NULL REFERENCES public.cash_drawer_sessions(id) ON DELETE RESTRICT,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  collector_id UUID NOT NULL REFERENCES public.collectors(id) ON DELETE RESTRICT,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01',
  amount_received NUMERIC(12, 2) NOT NULL CHECK (amount_received > 0),
  principal_portion NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (principal_portion >= 0),
  interest_portion NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (interest_portion >= 0),
  pre_balance NUMERIC(12, 2) NOT NULL,
  post_balance NUMERIC(12, 2) NOT NULL CHECK (post_balance <= pre_balance),
  payment_channel payment_method NOT NULL DEFAULT 'efectivo',
  gps_lat NUMERIC(10, 7),
  gps_lng NUMERIC(10, 7),
  collection_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  entry_hash TEXT GENERATED ALWAYS AS (
    encode(digest(id::text || loan_id::text || amount_received::text || collection_timestamp::text, 'sha256'), 'hex')
  ) STORED
);

-- ==============================================================================
-- 9. GASTOS OPERATIVOS POR RUTA (OPEX - AISLADOS POR ORGANIZATION_ID)
-- ==============================================================================
CREATE TABLE public.route_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.cash_drawer_sessions(id) ON DELETE RESTRICT,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  collector_id UUID NOT NULL REFERENCES public.collectors(id) ON DELETE RESTRICT,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01',
  category expense_category NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  receipt_voucher_url TEXT,
  is_approved_by_cfo BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 10. AUDITORÍA INMUTABLE DE MODIFICACIONES Y SEGURIDAD
-- ==============================================================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
  actor_email TEXT NOT NULL,
  organization_id TEXT DEFAULT 'org-medellin-01',
  action_name TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  justification TEXT NOT NULL,
  ip_address TEXT,
  event_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 11. POLÍTICAS ESTRICTAS DE ROW LEVEL SECURITY (RLS) MULTI-TENANT
--     REGLA 1: Aislamiento absoluto entre inquilinos (organization_id / tenant_id)
--     REGLA 2: PROHIBICIÓN TOTAL de INSERT / UPDATE / DELETE y lectura financiera
--              confidencial para el rol 'super_admin' (Proveedor SaaS).
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- A. POLÍTICAS PARA PROFILES (Gestión de Cuentas y Soporte Técnico)
-- ------------------------------------------------------------------------------
CREATE POLICY "profiles_select_hierarchy" ON public.profiles
  FOR SELECT USING (
    public.is_super_admin() OR
    (
      public.is_admin()
      AND organization_id = public.get_current_user_org_id()
    ) OR
    id = auth.uid()
  );

CREATE POLICY "profiles_insert_hierarchy" ON public.profiles
  FOR INSERT WITH CHECK (
    -- Super Admin solo puede provisionar perfiles con rol 'admin' para nuevos tenants
    (public.is_super_admin() AND role = 'admin') OR
    -- Un Admin solo puede crear cobradores dentro de su propio organization_id (tenant_id)
    (
      public.is_admin()
      AND role IN ('collector', 'cobrador')
      AND organization_id = public.get_current_user_org_id()
    )
  );

CREATE POLICY "profiles_update_hierarchy" ON public.profiles
  FOR UPDATE USING (
    (public.is_super_admin() AND role = 'admin') OR
    (
      public.is_admin()
      AND organization_id = public.get_current_user_org_id()
    )
  );

-- ------------------------------------------------------------------------------
-- B. POLÍTICAS PARA ROUTES (Facturación SaaS para Super Admin / Operación por Tenant)
-- ------------------------------------------------------------------------------
-- SELECT:
--   - 'super_admin': Lectura permitida ÚNICAMENTE sobre rutas para contabilizar rutas activas por tenant (facturación SaaS).
--   - 'admin': SOLO ve las rutas de su propio organization_id (tenant_id).
--   - 'collector': SOLO ve su ruta asignada dentro de su organization_id.
CREATE POLICY "routes_select_multitenant" ON public.routes
  FOR SELECT USING (
    public.is_super_admin() OR
    (
      public.is_admin()
      AND organization_id = public.get_current_user_org_id()
    ) OR
    (
      organization_id = public.get_current_user_org_id()
      AND (
        id::text = public.get_collector_assigned_route()
        OR code = public.get_collector_assigned_route()
      )
    )
  );

-- INSERT / UPDATE / DELETE en routes: ESTRICTAMENTE PROHIBIDO para 'super_admin'
CREATE POLICY "routes_insert_tenant_only" ON public.routes
  FOR INSERT WITH CHECK (
    NOT public.is_super_admin()
    AND (
      public.is_admin()
      OR public.get_current_user_role() IN ('collector', 'cobrador')
    )
    AND organization_id = public.get_current_user_org_id()
  );

CREATE POLICY "routes_update_tenant_only" ON public.routes
  FOR UPDATE USING (
    NOT public.is_super_admin()
    AND public.is_admin()
    AND organization_id = public.get_current_user_org_id()
  )
  WITH CHECK (
    NOT public.is_super_admin()
    AND public.is_admin()
    AND organization_id = public.get_current_user_org_id()
  );

-- ------------------------------------------------------------------------------
-- C. POLÍTICAS PARA CLIENTS (TABLA FINANCIERA CONFIDENCIAL)
--    * Aislamiento Multi-Tenant estricto por organization_id (tenant_id)
--    * Super Admin tiene BLOQUEADO SELECT, INSERT, UPDATE y DELETE (0 filas)
-- ------------------------------------------------------------------------------
CREATE POLICY "clients_select_tenant_isolation" ON public.clients
  FOR SELECT USING (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR route_id::text = public.get_collector_assigned_route()
      OR user_id = auth.uid()
    )
  );

CREATE POLICY "clients_insert_tenant_isolation" ON public.clients
  FOR INSERT WITH CHECK (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR (
        public.get_current_user_role() IN ('collector', 'cobrador')
        AND route_id::text = public.get_collector_assigned_route()
      )
    )
  );

CREATE POLICY "clients_update_tenant_isolation" ON public.clients
  FOR UPDATE USING (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR (
        public.get_current_user_role() IN ('collector', 'cobrador')
        AND route_id::text = public.get_collector_assigned_route()
      )
    )
  )
  WITH CHECK (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
  );

-- ------------------------------------------------------------------------------
-- D. POLÍTICAS PARA LOANS (CARTERA DE MICROCRÉDITOS CONFIDENCIAL)
--    * Ningún Admin puede ver ni alterar préstamos de otro Admin (organization_id)
--    * Super Admin tiene ESTRICTAMENTE PROHIBIDO SELECT, INSERT, UPDATE y DELETE
-- ------------------------------------------------------------------------------
CREATE POLICY "loans_select_tenant_isolation" ON public.loans
  FOR SELECT USING (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR route_id::text = public.get_collector_assigned_route()
    )
  );

CREATE POLICY "loans_insert_tenant_isolation" ON public.loans
  FOR INSERT WITH CHECK (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR (
        public.get_current_user_role() IN ('collector', 'cobrador')
        AND route_id::text = public.get_collector_assigned_route()
      )
    )
  );

CREATE POLICY "loans_update_tenant_isolation" ON public.loans
  FOR UPDATE USING (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR (
        public.get_current_user_role() IN ('collector', 'cobrador')
        AND route_id::text = public.get_collector_assigned_route()
      )
    )
  )
  WITH CHECK (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
  );

-- ------------------------------------------------------------------------------
-- E. POLÍTICAS PARA PAYMENTS Y DAILY_LEDGER (RECAUDO Y ABONOS CONFIDENCIALES)
--    * Append-Only para Admin y Collector de su propio organization_id (tenant_id)
--    * Super Admin tiene ESTRICTAMENTE PROHIBIDO SELECT, INSERT, UPDATE y DELETE
-- ------------------------------------------------------------------------------
CREATE POLICY "payments_select_tenant_isolation" ON public.payments
  FOR SELECT USING (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR route_id::text = public.get_collector_assigned_route()
    )
  );

CREATE POLICY "payments_insert_tenant_isolation" ON public.payments
  FOR INSERT WITH CHECK (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR (
        public.get_current_user_role() IN ('collector', 'cobrador')
        AND route_id::text = public.get_collector_assigned_route()
      )
    )
  );

CREATE POLICY "daily_ledger_select_tenant_isolation" ON public.daily_ledger
  FOR SELECT USING (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR route_id::text = public.get_collector_assigned_route()
    )
  );

CREATE POLICY "daily_ledger_insert_tenant_isolation" ON public.daily_ledger
  FOR INSERT WITH CHECK (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR (
        public.get_current_user_role() IN ('collector', 'cobrador')
        AND route_id::text = public.get_collector_assigned_route()
      )
    )
  );

-- ------------------------------------------------------------------------------
-- F. POLÍTICAS PARA CASH_DRAWER_SESSIONS (ARQUEOS Y TURNOS DE CAJA)
--    * Aislamiento estricto por organization_id (tenant_id)
--    * Super Admin tiene ESTRICTAMENTE PROHIBIDO SELECT, INSERT, UPDATE y DELETE
-- ------------------------------------------------------------------------------
CREATE POLICY "cash_drawer_sessions_select_tenant_isolation" ON public.cash_drawer_sessions
  FOR SELECT USING (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR route_id::text = public.get_collector_assigned_route()
    )
  );

CREATE POLICY "cash_drawer_sessions_insert_tenant_isolation" ON public.cash_drawer_sessions
  FOR INSERT WITH CHECK (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR (
        public.get_current_user_role() IN ('collector', 'cobrador')
        AND route_id::text = public.get_collector_assigned_route()
      )
    )
  );

CREATE POLICY "cash_drawer_sessions_update_tenant_isolation" ON public.cash_drawer_sessions
  FOR UPDATE USING (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR (
        public.get_current_user_role() IN ('collector', 'cobrador')
        AND route_id::text = public.get_collector_assigned_route()
      )
    )
  )
  WITH CHECK (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
  );

-- ------------------------------------------------------------------------------
-- G. POLÍTICAS PARA ROUTE_EXPENSES (GASTOS OPERATIVOS OPEX POR TENANT)
-- ------------------------------------------------------------------------------
CREATE POLICY "expenses_select_tenant_isolation" ON public.route_expenses
  FOR SELECT USING (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR route_id::text = public.get_collector_assigned_route()
    )
  );

CREATE POLICY "expenses_insert_tenant_isolation" ON public.route_expenses
  FOR INSERT WITH CHECK (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR (
        public.get_current_user_role() IN ('collector', 'cobrador')
        AND route_id::text = public.get_collector_assigned_route()
      )
    )
  );

-- ------------------------------------------------------------------------------
-- H. POLÍTICAS PARA AUDIT_LOGS
-- ------------------------------------------------------------------------------
CREATE POLICY "audit_logs_select_tenant_isolation" ON public.audit_logs
  FOR SELECT USING (
    (public.is_admin() AND organization_id = public.get_current_user_org_id())
    OR public.is_super_admin()
  );

CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ==============================================================================
-- 12. VISTA SEGURA DE FACTURACIÓN SAAS PARA EL SUPER_ADMIN (SOLO MÉTRICAS OPERATIVAS)
--     Expone únicamente el conteo de rutas activas y cobradores por tenant_id
--     sin revelar nombres de clientes, saldos de préstamos ni flujo de caja.
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_saas_tenant_billing_metrics AS
SELECT
  r.organization_id AS tenant_id,
  COALESCE(MAX(p.organization_name), r.organization_id) AS organization_name,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'activa') AS active_routes_count,
  COUNT(DISTINCT r.id) AS total_routes_count,
  COUNT(DISTINCT p.id) FILTER (WHERE p.role IN ('collector', 'cobrador') AND p.is_active = TRUE) AS active_collectors_count,
  (COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'activa') * 180000)::NUMERIC(12, 2) AS estimated_monthly_billing_cop
FROM public.routes r
LEFT JOIN public.profiles p ON p.organization_id = r.organization_id
GROUP BY r.organization_id;

GRANT SELECT ON public.v_saas_tenant_billing_metrics TO authenticated;

-- ==============================================================================
-- 13. BLOQUEO FÍSICO A NIVEL DE MOTOR (TRIGGER ANTI-MANIPULACIÓN PARA SUPER_ADMIN)
--     Garantiza técnicamente que incluso ante un bypass de políticas, el rol
--     'super_admin' tenga ESTRICTAMENTE PROHIBIDO hacer INSERT, UPDATE o DELETE
--     en clients, loans, payments, daily_ledger y cash_drawer_sessions.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_forbid_super_admin_financial_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF public.is_super_admin() THEN
    RAISE EXCEPTION 'BLOQUEO DE SEGURIDAD MULTI-TENANT (RLS): El rol super_admin (Proveedor SaaS) tiene estrictamente prohibido ejecutar % sobre la tabla financiera confidencial %.', TG_OP, TG_TABLE_NAME;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_forbid_super_admin_clients
BEFORE INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.fn_forbid_super_admin_financial_mutation();

CREATE OR REPLACE TRIGGER trg_forbid_super_admin_loans
BEFORE INSERT OR UPDATE OR DELETE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.fn_forbid_super_admin_financial_mutation();

CREATE OR REPLACE TRIGGER trg_forbid_super_admin_payments
BEFORE INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.fn_forbid_super_admin_financial_mutation();

CREATE OR REPLACE TRIGGER trg_forbid_super_admin_daily_ledger
BEFORE INSERT OR UPDATE OR DELETE ON public.daily_ledger
FOR EACH ROW EXECUTE FUNCTION public.fn_forbid_super_admin_financial_mutation();

CREATE OR REPLACE TRIGGER trg_forbid_super_admin_cash_drawer
BEFORE INSERT OR UPDATE OR DELETE ON public.cash_drawer_sessions
FOR EACH ROW EXECUTE FUNCTION public.fn_forbid_super_admin_financial_mutation();

-- ==============================================================================
-- 14. FUNCIÓN TRANSACCIONAL ATÓMICA: REGISTRO DE PAGO Y DESCUENTO AUTOMÁTICO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.register_daily_payment(
  p_shift_id UUID,
  p_loan_id UUID,
  p_collector_id UUID,
  p_amount NUMERIC(12, 2),
  p_channel payment_method,
  p_lat NUMERIC(10, 7),
  p_lng NUMERIC(10, 7),
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_loan RECORD;
  v_new_balance NUMERIC(12, 2);
  v_interest_ratio NUMERIC(8, 6);
  v_interest_part NUMERIC(12, 2);
  v_principal_part NUMERIC(12, 2);
  v_ledger_id UUID;
  v_receipt VARCHAR(40);
BEGIN
  -- Prohibir ejecución por parte de super_admin
  IF public.is_super_admin() THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: El rol super_admin no puede registrar ni alterar pagos.';
  END IF;

  -- Bloquear fila del préstamo para evitar condición de carrera (FOR UPDATE)
  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Préstamo no encontrado: %', p_loan_id;
  END IF;

  -- Validar aislamiento Multi-Tenant
  IF v_loan.organization_id <> public.get_current_user_org_id() THEN
    RAISE EXCEPTION 'VIOLACIÓN MULTI-TENANT: No puede operar sobre un préstamo de otra organización.';
  END IF;

  IF v_loan.status = 'liquidado' THEN
    RAISE EXCEPTION 'El préstamo % ya se encuentra liquidado', v_loan.loan_code;
  END IF;

  IF p_amount > v_loan.remaining_balance THEN
    RAISE EXCEPTION 'Monto recibido (%) supera el saldo pendiente actual (%)', p_amount, v_loan.remaining_balance;
  END IF;

  -- Calcular proporción de capital vs interés
  v_interest_ratio := v_loan.total_interest_amount / v_loan.total_debt_amount;
  v_interest_part := ROUND(p_amount * v_interest_ratio, 0);
  v_principal_part := p_amount - v_interest_part;
  v_new_balance := GREATEST(0, v_loan.remaining_balance - p_amount);
  v_receipt := 'REC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);

  -- 1. Insertar en el Ledger Inmutable
  INSERT INTO public.daily_ledger (
    receipt_number, shift_id, route_id, loan_id, client_id, collector_id, organization_id,
    amount_received, principal_portion, interest_portion, pre_balance, post_balance,
    payment_channel, gps_lat, gps_lng, notes
  ) VALUES (
    v_receipt, p_shift_id, v_loan.route_id, p_loan_id, v_loan.client_id, p_collector_id, v_loan.organization_id,
    p_amount, v_principal_part, v_interest_part, v_loan.remaining_balance, v_new_balance,
    p_channel, p_lat, p_lng, p_notes
  ) RETURNING id INTO v_ledger_id;

  -- 2. Actualizar saldos del préstamo
  UPDATE public.loans
  SET 
    total_collected_amount = total_collected_amount + p_amount,
    remaining_balance = v_new_balance,
    installments_paid_count = installments_paid_count + 1,
    status = CASE WHEN v_new_balance = 0 THEN 'liquidado'::loan_status ELSE status END
  WHERE id = p_loan_id;

  -- 3. Actualizar acumulados de la sesión de caja del cobrador
  IF p_channel = 'efectivo' THEN
    UPDATE public.cash_drawer_sessions
    SET cash_collected_total = cash_collected_total + p_amount
    WHERE id = p_shift_id;
  ELSE
    UPDATE public.cash_drawer_sessions
    SET digital_collected_total = digital_collected_total + p_amount
    WHERE id = p_shift_id;
  END IF;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 15. TRIGGERS DE AUDITORÍA AUTOMÁTICA E INMUTABILIDAD CONTABLE
-- ==============================================================================

-- TRIGGER 1: AUDITORÍA AUTOMÁTICA DE CAMBIOS EN PRÉSTAMOS
CREATE OR REPLACE FUNCTION public.fn_audit_loans_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.remaining_balance IS DISTINCT FROM NEW.remaining_balance)
     OR (OLD.installment_amount IS DISTINCT FROM NEW.installment_amount)
     OR (OLD.term_days IS DISTINCT FROM NEW.term_days)
     OR (OLD.status IS DISTINCT FROM NEW.status) THEN

    INSERT INTO public.audit_logs (
      actor_user_id,
      actor_email,
      organization_id,
      action_name,
      target_table,
      target_id,
      old_data,
      new_data,
      justification,
      event_hash
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM public.profiles WHERE id = auth.uid()), 'sistema_trigger@rutacapital.co'),
      NEW.organization_id,
      'ALTERACION_SALDO_MANUAL',
      'public.loans',
      OLD.id::text,
      jsonb_build_object('remaining_balance', OLD.remaining_balance, 'installment_amount', OLD.installment_amount, 'term_days', OLD.term_days),
      jsonb_build_object('remaining_balance', NEW.remaining_balance, 'installment_amount', NEW.installment_amount, 'term_days', NEW.term_days),
      'Modificación de parámetros financieros del crédito registrada por trigger de base de datos.',
      encode(digest(OLD.id::text || NOW()::text, 'sha256'), 'hex')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_audit_loans_changes
BEFORE UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_loans_changes();

-- TRIGGER 2: PREVENCIÓN DE BORRADO O ALTERACIÓN EN DAILY_LEDGER Y PAYMENTS (APPEND-ONLY)
CREATE OR REPLACE FUNCTION public.fn_prevent_daily_ledger_tampering()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_email,
    organization_id,
    action_name,
    target_table,
    target_id,
    old_data,
    new_data,
    justification,
    event_hash
  ) VALUES (
    auth.uid(),
    COALESCE((SELECT email FROM public.profiles WHERE id = auth.uid()), 'anon@rutacapital.co'),
    OLD.organization_id,
    'BORRADO_PAGO_RECHAZADO',
    TG_TABLE_NAME,
    OLD.id::text,
    jsonb_build_object('amount_received', OLD.amount_received, 'receipt_number', OLD.receipt_number),
    jsonb_build_object('status', 'INTENTO_BORRADO_RECHAZADO'),
    'ALERTA ANTIFRAUDE: Intento de eliminación o alteración en libro mayor de pagos interceptado por el motor.',
    encode(digest(OLD.id::text || NOW()::text, 'sha256'), 'hex')
  );

  RAISE EXCEPTION 'FRAUDE BLOQUEADO: La tabla % es inmutable (Append-Only). No se permite UPDATE ni DELETE.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_prevent_daily_ledger_tampering
BEFORE UPDATE OR DELETE ON public.daily_ledger
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_daily_ledger_tampering();

CREATE OR REPLACE TRIGGER trg_prevent_payments_tampering
BEFORE UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_daily_ledger_tampering();

-- TRIGGER 3: INMUTABILIDAD TOTAL DE AUDIT_LOGS (ANTI-ALTERACIÓN DE LOGS)
CREATE OR REPLACE FUNCTION public.fn_prevent_audit_logs_tampering()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'VIOLACIÓN DE SEGURIDAD: Los registros de public.audit_logs son estrictamente inmutables.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_prevent_audit_logs_tampering
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_audit_logs_tampering();

-- ==============================================================================
-- 16. GESTIÓN DE BASES SEMANALES PARA COBRADORES (COLLECTOR_BASES & RLS MULTI-TENANT)
-- ==============================================================================
CREATE TABLE public.collector_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01',
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  week_start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVA' CHECK (status IN ('ACTIVA', 'DEVUELTA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.collector_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collector_bases_select_tenant_policy" ON public.collector_bases
  FOR SELECT USING (
    NOT public.is_super_admin()
    AND organization_id = public.get_current_user_org_id()
    AND (
      public.is_admin()
      OR collector_id = auth.uid()
    )
  );

CREATE POLICY "collector_bases_insert_tenant_admin" ON public.collector_bases
  FOR INSERT WITH CHECK (
    NOT public.is_super_admin()
    AND public.is_admin()
    AND organization_id = public.get_current_user_org_id()
  );

CREATE POLICY "collector_bases_update_tenant_admin" ON public.collector_bases
  FOR UPDATE USING (
    NOT public.is_super_admin()
    AND public.is_admin()
    AND organization_id = public.get_current_user_org_id()
  )
  WITH CHECK (
    NOT public.is_super_admin()
    AND public.is_admin()
    AND organization_id = public.get_current_user_org_id()
  );
`;

export const SupabaseSqlViewer: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'sql' | 'rbac_rls' | 'tables' | 'cfo_rules'>('sql');

  const handleCopy = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([SUPABASE_SQL_SCRIPT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'supabase_multitenant_rls_medellin.sql';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* HEADER DEL VISUALIZADOR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Supabase / PostgreSQL 15+
            </span>
            <span className="text-xs text-slate-400 font-mono">Multi-Tenant Isolation & Zero-Trust SaaS RLS v3.0</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            Políticas RLS Multi-Tenant y Bloqueo Financiero de Super Admin
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Aislamiento estricto por <code className="text-emerald-400">organization_id (tenant_id)</code> entre Administradores y prohibición técnica de escritura/lectura confidencial para <code className="text-amber-300">super_admin</code>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-400" />
            Descargar .sql
          </button>
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '¡Copiado!' : 'Copiar SQL'}
          </button>
        </div>
      </div>

      {/* PESTAÑAS DE VISTA */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('sql')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'sql'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          Script SQL DDL & RLS Multi-Tenant
        </button>

        <button
          onClick={() => setActiveTab('rbac_rls')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'rbac_rls'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          Matriz de Aislamiento RLS (Super Admin vs Tenant Admin)
        </button>

        <button
          onClick={() => setActiveTab('tables')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'tables'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Diccionario de Datos & Relaciones
        </button>

        <button
          onClick={() => setActiveTab('cfo_rules')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'cfo_rules'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Reglas de Integridad del CFO
        </button>
      </div>

      {/* CONTENIDO DE PESTAÑAS */}
      {activeTab === 'sql' && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs overflow-x-auto text-emerald-400/90 leading-relaxed max-h-[580px] shadow-2xl">
          <pre>{SUPABASE_SQL_SCRIPT}</pre>
        </div>
      )}

      {activeTab === 'rbac_rls' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Matriz de Seguridad Multi-Tenant y Bloqueo de Super Admin (PostgreSQL RLS)
            </h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Las políticas RLS garantizan matemáticamente dos principios: <strong>1) Aislamiento Total de Inquilinos</strong> (un <code className="text-emerald-400 font-mono">admin</code> jamás puede leer ni tocar filas donde <code className="text-emerald-400 font-mono">organization_id != get_current_user_org_id()</code>) y <strong>2) Neutralidad Financiera del Proveedor SaaS</strong> (el rol <code className="text-amber-300 font-mono">super_admin</code> tiene bloqueado <code className="text-rose-400 font-mono">INSERT, UPDATE, DELETE</code> y lectura confidencial en <code className="text-slate-200 font-mono">clients, loans, payments, cash_drawer_sessions</code>).
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="py-2.5 px-3">Tabla / Vista</th>
                    <th className="py-2.5 px-3">Operación</th>
                    <th className="py-2.5 px-3">Super Admin (Proveedor SaaS)</th>
                    <th className="py-2.5 px-3">Admin (Inquilino Tenant_ID)</th>
                    <th className="py-2.5 px-3">Collector (Ruta Asignada)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">public.clients</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">SELECT / INSERT / UPDATE / DELETE</td>
                    <td className="py-2.5 px-3 text-rose-400 font-bold">✗ PROHIBIDO (RLS + Trigger Block)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">✓ Solo su organization_id</td>
                    <td className="py-2.5 px-3 text-indigo-300">✓ Solo su organization_id + route_id</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">public.loans</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">SELECT / INSERT / UPDATE / DELETE</td>
                    <td className="py-2.5 px-3 text-rose-400 font-bold">✗ PROHIBIDO (RLS + Trigger Block)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">✓ Solo su organization_id</td>
                    <td className="py-2.5 px-3 text-indigo-300">✓ Solo su organization_id + route_id</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">public.payments / daily_ledger</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">SELECT / INSERT (Append-Only)</td>
                    <td className="py-2.5 px-3 text-rose-400 font-bold">✗ PROHIBIDO (RLS + Trigger Block)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">✓ Solo su organization_id</td>
                    <td className="py-2.5 px-3 text-indigo-300">✓ Solo su organization_id + route_id</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">public.cash_drawer_sessions</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">SELECT / INSERT / UPDATE</td>
                    <td className="py-2.5 px-3 text-rose-400 font-bold">✗ PROHIBIDO (RLS + Trigger Block)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">✓ Solo su organization_id</td>
                    <td className="py-2.5 px-3 text-indigo-300">✓ Solo su turno y ruta</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-300">public.routes & v_saas_tenant_billing_metrics</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">SELECT (Facturación SaaS)</td>
                    <td className="py-2.5 px-3 text-amber-300 font-semibold">✓ SOLO LECTURA (Conteo de rutas activas)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">✓ CRUD solo en su organization_id</td>
                    <td className="py-2.5 px-3 text-indigo-300">✓ Lectura de su ruta asignada</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Lock className="w-4 h-4" />
                Aislamiento de Inquilinos (get_current_user_org_id)
              </span>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Todas las políticas de <code className="text-slate-200 font-mono">clients</code>, <code className="text-slate-200 font-mono">loans</code>, <code className="text-slate-200 font-mono">payments</code> y <code className="text-slate-200 font-mono">cash_drawer_sessions</code> exigen coincidencia exacta del <code className="text-emerald-300 font-mono">organization_id</code>:
              </p>
              <pre className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-300">
{`NOT public.is_super_admin()
AND organization_id = public.get_current_user_org_id()`}
              </pre>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                Trigger de Bloqueo a Super Admin
              </span>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Además de RLS, el disparador <code className="text-slate-200 font-mono">fn_forbid_super_admin_financial_mutation()</code> aborta cualquier intento de <code className="text-rose-300 font-mono">INSERT, UPDATE, DELETE</code> en tablas financieras por parte del proveedor SaaS:
              </p>
              <pre className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-[11px] text-amber-300">
{`IF public.is_super_admin() THEN
  RAISE EXCEPTION 'BLOQUEO MULTI-TENANT: super_admin no puede alterar tablas financieras';
END IF;`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tables' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              name: 'profiles',
              desc: 'Tabla central de identidad vinculada a auth.users(id). Almacena el rol (super_admin, admin, collector) y el organization_id (tenant_id).',
              keys: 'PK: id REFERENCES auth.users(id) | Tenant: organization_id'
            },
            {
              name: 'routes',
              desc: 'Rutas territoriales por tenant (Comuna 13, Manrique, Belén, Itagüí). El super_admin solo puede leer el conteo de rutas activas para facturación SaaS.',
              keys: 'PK: id | Unique: code | Tenant: organization_id'
            },
            {
              name: 'clients',
              desc: 'Padrón confidencial de deudores por tenant. Bloqueado al 100% para super_admin (SELECT/INSERT/UPDATE/DELETE prohibidos).',
              keys: 'PK: id | FK: route_id | Tenant: organization_id'
            },
            {
              name: 'loans',
              desc: 'Contratos confidenciales de microcrédito activo por tenant. Aislados estrictamente entre administradores.',
              keys: 'PK: id | FK: route_id, client_id | Tenant: organization_id'
            },
            {
              name: 'payments / daily_ledger',
              desc: 'Libro mayor inmutable (append-only) de pagos recibidos. Bloqueado contra lectura o alteración del proveedor SaaS.',
              keys: 'PK: id | FK: session_id, loan_id, client_id | Tenant: organization_id'
            },
            {
              name: 'cash_drawer_sessions',
              desc: 'Sesiones de caja diaria para arqueo ciego de cobradores. Estricto aislamiento por organization_id.',
              keys: 'PK: id | Unique: (route_id, shift_date) | Tenant: organization_id'
            }
          ].map((table) => (
            <div key={table.name} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-white text-sm bg-slate-800 px-2 py-0.5 rounded">
                  public.{table.name}
                </span>
                <span className="text-[10px] text-emerald-400 font-mono font-semibold">PostgreSQL RLS</span>
              </div>
              <p className="text-xs text-slate-300 leading-normal">{table.desc}</p>
              <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800 pt-1.5">
                {table.keys}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'cfo_rules' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <h3 className="font-bold text-white text-sm">
            Fundamentos de Arquitectura Multi-Tenant & Privacidad Financiera
          </h3>

          <div className="space-y-3">
            <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              <span className="font-bold text-emerald-400 block mb-1">
                1. Aislamiento Horizontal Estricto entre Administradores (Tenant Isolation)
              </span>
              <p className="text-slate-300">
                Cada registro en <code className="text-emerald-300">clients</code>, <code className="text-emerald-300">loans</code>, <code className="text-emerald-300">payments</code> y <code className="text-emerald-300">cash_drawer_sessions</code> incluye <code className="text-amber-300">organization_id</code>. Las políticas RLS comparan en tiempo de ejecución <code className="text-slate-200">organization_id = public.get_current_user_org_id()</code>, impidiendo que un Admin vea o modifique la cartera de otro Admin.
              </p>
            </div>

            <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              <span className="font-bold text-amber-400 block mb-1">
                2. Prohibición de Escritura y Privacidad ante el Proveedor SaaS (Super Admin)
              </span>
              <p className="text-slate-300">
                El rol <code className="text-amber-300">super_admin</code> está excluido de <code className="text-slate-200">public.is_admin()</code> y bloqueado explícitamente con <code className="text-rose-300">NOT public.is_super_admin()</code> y triggers <code className="text-rose-300">BEFORE INSERT OR UPDATE OR DELETE</code> en todas las tablas financieras confidenciales. Solo puede consultar la vista <code className="text-emerald-300">v_saas_tenant_billing_metrics</code> para facturar según la cantidad de rutas activas.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
