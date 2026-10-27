import React, { useState } from 'react';
import { 
  Database, 
  Copy, 
  Check, 
  Terminal, 
  FileCode, 
  Layers, 
  ShieldCheck, 
  Download, 
  Lock, 
  UserCheck, 
  Eye, 
  AlertTriangle 
} from 'lucide-react';

export const SUPABASE_SQL_SCRIPT = `-- ==============================================================================
-- SISTEMA DE MICROCRÉDITOS Y LIQUIDEZ DIARIA (RUTACAPITAL OS)
-- MOTOR DE BASE DE DATOS SUPABASE / POSTGRESQL (MEDELLÍN CORE)
-- ESQUEMA COMPLETO CON CONTROL DE ACCESO BASADO EN ROLES (RBAC & RLS)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TIPOS ENUMERADOS & JERARQUÍA DE ROLES DE 3 NIVELES
-- ==============================================================================
-- Nivel 1: 'super_admin' (Administrador General del Sistema - Visibilidad Total y crea Admins)
-- Nivel 2: 'admin'       (Administrador de Fondo/Negocio - Crea sus propios Collectors y Clientes)
-- Nivel 3: 'collector'   (Cobrador de Ruta - Solo ve clientes y registra pagos de su ruta asignada)
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'collector', 'socio', 'cobrador', 'cliente');
CREATE TYPE route_status AS ENUM ('activa', 'suspendida', 'en_auditoria');
CREATE TYPE client_risk_tier AS ENUM ('A_excelente', 'B_promedio', 'C_alto_riesgo', 'D_mora_critica', 'X_vetado');
CREATE TYPE loan_status AS ENUM ('activo', 'liquidado', 'mora_severa', 'castigado', 'refinanciado');
CREATE TYPE payment_frequency AS ENUM ('diario_habil', 'diario_corrido', 'semanal');
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
-- 2. TABLA DE PERFILES VINCULADA A AUTH.USERS (JERARQUÍA DE 3 NIVELES + MULTI-TENANT)
-- ==============================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'collector',
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01', -- Vincula a cada 'admin' con su grupo de cobradores y clientes
  organization_name TEXT DEFAULT 'Fondo RutaCapital',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Jerarquía directa: quién creó esta cuenta
  assigned_route_id TEXT,                                 -- Ej: 'route-1' (Ruta asignada al collector)
  route_zone TEXT,                                        -- Ej: 'Centro / El Hueco', 'Laureles / Estadio', 'El Poblado', etc.
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
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- FUNCIÓN HELPER 2: VALIDAR SI ES SUPER_ADMIN (NIVEL 1 - VISIBILIDAD TOTAL)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role = 'super_admin' 
      AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- FUNCIÓN HELPER 3: VALIDAR SI ES ADMIN DE FONDO (NIVEL 2)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin') 
      AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- FUNCIÓN HELPER 4: OBTENER EL ORGANIZATION_ID DEL USUARIO AUTENTICADO
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

-- FUNCIÓN HELPER 6: VALIDAR SI ES SUPER_ADMIN, ADMIN O SOCIO
CREATE OR REPLACE FUNCTION public.is_admin_or_socio()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin', 'socio') 
      AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- TRIGGER AUTOMÁTICO PARA SINCRONIZAR AUTH.USERS -> PUBLIC.PROFILES CON JERARQUÍA DE 3 NIVELES Y ZONA DE COBRO
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
-- 3. RUTAS OPERATIVAS (Comunas / Sectores vinculados a organization_id y created_by)
-- ==============================================================================
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,                       -- Ej: 'RUTA-MED-01'
  name VARCHAR(100) NOT NULL,                             -- Ej: 'Comuna 13 - San Javier'
  city VARCHAR(50) NOT NULL DEFAULT 'Medellín',
  zone_sector VARCHAR(100) NOT NULL,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  base_floating_capital NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (base_floating_capital >= 0),
  fixed_daily_opex NUMERIC(12, 2) NOT NULL DEFAULT 45000.00,
  max_portfolio_limit NUMERIC(14, 2) NOT NULL DEFAULT 50000000.00,
  target_recovery_rate NUMERIC(5, 2) NOT NULL DEFAULT 95.00,
  status route_status NOT NULL DEFAULT 'activa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. OPERADORES Y COBRADORES DE RUTA (Vinculados al Admin que los creó)
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
-- 5. CLIENTES / DEUDORES (Vinculados a organization_id, created_by y route_id)
-- ==============================================================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01',
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
-- 6. TURNOS DE CAJA DIARIA (ARQUEO CIEGO Y CIERRE)
-- ==============================================================================
CREATE TABLE public.daily_cash_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  collector_id UUID NOT NULL REFERENCES public.collectors(id) ON DELETE RESTRICT,
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
-- 7. PRÉSTAMOS ACTIVOS
-- ==============================================================================
CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_code VARCHAR(30) NOT NULL UNIQUE,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  collector_id UUID NOT NULL REFERENCES public.collectors(id) ON DELETE RESTRICT,
  organization_id TEXT NOT NULL DEFAULT 'org-medellin-01',
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
-- 8. LEDGER INMUTABLE DE COBROS DIARIOS (APPEND-ONLY)
-- ==============================================================================
CREATE TABLE public.daily_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number VARCHAR(40) NOT NULL UNIQUE,
  shift_id UUID NOT NULL REFERENCES public.daily_cash_shifts(id) ON DELETE RESTRICT,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  collector_id UUID NOT NULL REFERENCES public.collectors(id) ON DELETE RESTRICT,
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
-- 9. GASTOS OPERATIVOS POR RUTA (OPEX - INFORMACIÓN SENSIBLE)
-- ==============================================================================
CREATE TABLE public.route_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.daily_cash_shifts(id) ON DELETE RESTRICT,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  collector_id UUID NOT NULL REFERENCES public.collectors(id) ON DELETE RESTRICT,
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
-- 11. POLÍTICAS DE ROW LEVEL SECURITY (RLS) - JERARQUÍA DE 3 NIVELES
-- ==============================================================================

-- ACTIVAR RLS EN TODAS LAS TABLAS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- A. POLÍTICAS PARA PROFILES (JERARQUÍA 3 NIVELES: super_admin -> admin -> collector)
-- ------------------------------------------------------------------------------
-- 1. Lectura:
--    - 'super_admin' ve todos los perfiles del sistema.
--    - 'admin' ve su propio perfil y los perfiles de los cobradores/clientes que él creó o de su organization_id.
--    - 'collector' solo ve su propio perfil.
CREATE POLICY "profiles_select_hierarchy" ON public.profiles
  FOR SELECT USING (
    public.is_super_admin() OR
    id = auth.uid() OR
    (
      public.get_current_user_role() = 'admin' AND (
        created_by = auth.uid() OR
        organization_id = public.get_current_user_org_id()
      )
    )
  );

-- 2. Creación (INSERT):
--    - 'super_admin' puede crear cuentas con rol 'admin' o 'collector'.
--    - 'admin' SOLO puede crear usuarios con rol 'collector' atados a su propio auth.uid() y organization_id.
CREATE POLICY "profiles_insert_hierarchy" ON public.profiles
  FOR INSERT WITH CHECK (
    public.is_super_admin() OR
    (
      public.get_current_user_role() = 'admin' AND
      role IN ('collector', 'cobrador') AND
      created_by = auth.uid() AND
      organization_id = public.get_current_user_org_id()
    )
  );

-- 3. Modificación (UPDATE / DELETE):
--    - 'super_admin' tiene control total.
--    - 'admin' solo puede modificar los datos de los cobradores que él mismo creó (created_by = auth.uid()).
CREATE POLICY "profiles_update_hierarchy" ON public.profiles
  FOR UPDATE USING (
    public.is_super_admin() OR
    (
      public.get_current_user_role() = 'admin' AND
      role IN ('collector', 'cobrador') AND
      (created_by = auth.uid() OR organization_id = public.get_current_user_org_id())
    )
  );

-- ------------------------------------------------------------------------------
-- B. POLÍTICAS PARA COLLECTORS (AISLAMIENTO POR ADMIN / ORGANIZACIÓN)
-- ------------------------------------------------------------------------------
CREATE POLICY "collectors_select_hierarchy" ON public.collectors
  FOR SELECT USING (
    public.is_super_admin() OR
    user_id = auth.uid() OR
    (
      public.get_current_user_role() = 'admin' AND
      (created_by = auth.uid() OR organization_id = public.get_current_user_org_id())
    )
  );

CREATE POLICY "collectors_modify_hierarchy" ON public.collectors
  FOR ALL USING (
    public.is_super_admin() OR
    (
      public.get_current_user_role() = 'admin' AND
      (created_by = auth.uid() OR organization_id = public.get_current_user_org_id())
    )
  );

-- ------------------------------------------------------------------------------
-- C. POLÍTICAS PARA CLIENTES (clients - AISLAMIENTO DE 3 NIVELES)
-- ------------------------------------------------------------------------------
-- 1. Lectura:
--    - 'super_admin' ve todos los clientes.
--    - 'admin' ve los clientes de su organización o creados por él / su equipo.
--    - 'collector' solo ve los clientes de su ruta asignada (assigned_route_id).
CREATE POLICY "clients_select_hierarchy" ON public.clients
  FOR SELECT USING (
    public.is_super_admin() OR
    (
      public.get_current_user_role() = 'admin' AND
      (created_by = auth.uid() OR organization_id = public.get_current_user_org_id())
    ) OR
    (
      public.get_current_user_role() IN ('collector', 'cobrador') AND
      route_id::text = public.get_collector_assigned_route()
    )
  );

-- 2. Inserción y Modificación:
--    - 'super_admin' puede modificar cualquier cliente.
--    - 'admin' solo puede crear/modificar clientes de su propio fondo (created_by = auth.uid() o organization_id).
--    - 'collector' puede registrar clientes nuevos en su ruta asignada.
CREATE POLICY "clients_insert_hierarchy" ON public.clients
  FOR INSERT WITH CHECK (
    public.is_super_admin() OR
    (
      public.get_current_user_role() = 'admin' AND
      organization_id = public.get_current_user_org_id()
    ) OR
    (
      public.get_current_user_role() IN ('collector', 'cobrador') AND
      route_id::text = public.get_collector_assigned_route()
    )
  );

CREATE POLICY "clients_update_hierarchy" ON public.clients
  FOR UPDATE USING (
    public.is_super_admin() OR
    (
      public.get_current_user_role() = 'admin' AND
      (created_by = auth.uid() OR organization_id = public.get_current_user_org_id())
    )
  );

-- ------------------------------------------------------------------------------
-- D. POLÍTICAS PARA RUTAS Y PRÉSTAMOS (routes & loans - AISLAMIENTO DE 3 NIVELES)
-- ------------------------------------------------------------------------------
CREATE POLICY "routes_select_hierarchy" ON public.routes
  FOR SELECT USING (
    public.is_super_admin() OR
    (
      public.get_current_user_role() IN ('admin', 'socio') AND
      organization_id = public.get_current_user_org_id()
    ) OR
    id::text = public.get_collector_assigned_route()
  );

CREATE POLICY "loans_select_hierarchy" ON public.loans
  FOR SELECT USING (
    public.is_super_admin() OR
    (
      public.get_current_user_role() IN ('admin', 'socio') AND
      organization_id = public.get_current_user_org_id()
    ) OR
    route_id::text = public.get_collector_assigned_route()
  );

-- ------------------------------------------------------------------------------
-- E. POLÍTICAS PARA EL LIBRO MAYOR DE PAGOS (daily_ledger)
-- ------------------------------------------------------------------------------
CREATE POLICY "ledger_select_hierarchy" ON public.daily_ledger
  FOR SELECT USING (
    public.is_super_admin() OR
    public.is_admin_or_socio() OR
    route_id::text = public.get_collector_assigned_route()
  );

CREATE POLICY "ledger_insert_collector_route" ON public.daily_ledger
  FOR INSERT WITH CHECK (
    public.is_super_admin() OR
    public.is_admin() OR
    route_id::text = public.get_collector_assigned_route()
  );

-- ------------------------------------------------------------------------------
-- F. POLÍTICAS PARA GASTOS, TURNOS Y BITÁCORA DE AUDITORÍA
-- ------------------------------------------------------------------------------
CREATE POLICY "expenses_select_admin_socio" ON public.route_expenses
  FOR SELECT USING (public.is_admin_or_socio());

CREATE POLICY "shifts_select_admin_socio" ON public.daily_cash_shifts
  FOR SELECT USING (public.is_admin_or_socio());

CREATE POLICY "audit_select_admin_socio" ON public.audit_logs
  FOR SELECT USING (public.is_admin_or_socio());

CREATE POLICY "audit_insert_authenticated" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ==============================================================================
-- 12. TRIGGER ATÓMICO: LIQUIDACIÓN DE COBRO EN EL LEDGER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_process_daily_collection()
RETURNS TRIGGER AS $$
DECLARE
  v_shift_status shift_status;
  v_current_balance NUMERIC(12, 2);
  v_disbursed_principal NUMERIC(12, 2);
  v_total_interest NUMERIC(12, 2);
  v_capital_ratio NUMERIC(6, 4);
BEGIN
  -- Validar turno abierto
  SELECT status INTO v_shift_status FROM public.daily_cash_shifts WHERE id = NEW.shift_id;
  IF v_shift_status <> 'abierta' THEN
    RAISE EXCEPTION 'Turno cerrado. No se permite cobro.';
  END IF;

  -- Bloqueo pesimista para evitar concurrencia
  SELECT remaining_balance, principal_amount, total_interest_amount 
  INTO v_current_balance, v_disbursed_principal, v_total_interest
  FROM public.loans WHERE id = NEW.loan_id FOR UPDATE;

  NEW.pre_balance := v_current_balance;
  NEW.post_balance := GREATEST(0.00, v_current_balance - NEW.amount_received);

  -- Desglose proporcional de amortización capital vs interés
  v_capital_ratio := v_disbursed_principal / (v_disbursed_principal + v_total_interest);
  NEW.principal_portion := ROUND(NEW.amount_received * v_capital_ratio, 2);
  NEW.interest_portion := NEW.amount_received - NEW.principal_portion;

  -- Actualizar préstamo
  UPDATE public.loans
  SET remaining_balance = NEW.post_balance,
      total_collected_amount = total_collected_amount + NEW.amount_received,
      installments_paid_count = installments_paid_count + 1,
      status = CASE WHEN NEW.post_balance = 0 THEN 'liquidado'::loan_status ELSE status END
  WHERE id = NEW.loan_id;

  -- Actualizar turno de caja
  IF NEW.payment_channel = 'efectivo' THEN
    UPDATE public.daily_cash_shifts SET cash_collected_total = cash_collected_total + NEW.amount_received WHERE id = NEW.shift_id;
  ELSE
    UPDATE public.daily_cash_shifts SET digital_collected_total = digital_collected_total + NEW.amount_received WHERE id = NEW.shift_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_apply_ledger_payment
BEFORE INSERT ON public.daily_ledger
FOR EACH ROW EXECUTE FUNCTION public.fn_process_daily_collection();

-- ==============================================================================
-- 13. TABLA CASH_DRAWER_SESSIONS (CIERRES Y ARQUEOS DE CAJA POR COBRADOR)
-- ==============================================================================
CREATE TABLE public.cash_drawer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id UUID NOT NULL REFERENCES public.collectors(id) ON DELETE RESTRICT,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (opening_cash >= 0),
  cash_collected NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cash_collected >= 0),
  cash_disbursed NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cash_disbursed >= 0),
  route_expenses NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (route_expenses >= 0),
  expected_closing_cash NUMERIC(12, 2) GENERATED ALWAYS AS (
    opening_cash + cash_collected - cash_disbursed - route_expenses
  ) STORED,
  actual_closing_cash NUMERIC(12, 2) NOT NULL CHECK (actual_closing_cash >= 0),
  discrepancy NUMERIC(12, 2) GENERATED ALWAYS AS (
    actual_closing_cash - (opening_cash + cash_collected - cash_disbursed - route_expenses)
  ) STORED,
  status VARCHAR(20) NOT NULL CHECK (status IN ('cuadre_exacto', 'sobrante', 'faltante')),
  denominations JSONB NOT NULL DEFAULT '{}'::jsonb,
  collector_notes TEXT,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_approved BOOLEAN NOT NULL DEFAULT FALSE,
  admin_approved_at TIMESTAMPTZ,
  admin_approved_by UUID REFERENCES auth.users(id),
  integrity_hash TEXT NOT NULL
);

ALTER TABLE public.cash_drawer_sessions ENABLE ROW LEVEL SECURITY;

-- Cobradores solo leen sus propios arqueos; Administradores y Socios ven todos
CREATE POLICY "cash_drawer_sessions_select" ON public.cash_drawer_sessions
  FOR SELECT USING (
    public.is_admin_or_socio() OR
    collector_id IN (SELECT id FROM public.collectors WHERE user_id = auth.uid())
  );

CREATE POLICY "cash_drawer_sessions_insert" ON public.cash_drawer_sessions
  FOR INSERT WITH CHECK (
    public.is_admin() OR
    collector_id IN (SELECT id FROM public.collectors WHERE user_id = auth.uid())
  );

CREATE POLICY "cash_drawer_sessions_update_admin" ON public.cash_drawer_sessions
  FOR UPDATE USING (public.is_admin());

-- ==============================================================================
-- 14. TRIGGERS ANTIFRAUDE EN POSTGRESQL PARA AUDIT_LOGS INMUTABLES
-- ==============================================================================

-- TRIGGER 1: AUDITAR CUALQUIER ALTERACIÓN SENSIBLE EN LOANS (SALDO O CUOTA)
CREATE OR REPLACE FUNCTION public.fn_audit_loans_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.remaining_balance <> NEW.remaining_balance OR OLD.installment_amount <> NEW.installment_amount OR OLD.term_days <> NEW.term_days) THEN
    INSERT INTO public.audit_logs (
      actor_user_id,
      actor_email,
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

-- TRIGGER 2: PREVENCIÓN DE BORRADO O ALTERACIÓN EN DAILY_LEDGER (APPEND-ONLY)
CREATE OR REPLACE FUNCTION public.fn_prevent_daily_ledger_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Insertar alerta crítica en audit_logs antes de abortar la transacción
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_email,
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
    'BORRADO_PAGO_RECHAZADO',
    'public.daily_ledger',
    OLD.id::text,
    jsonb_build_object('amount_received', OLD.amount_received, 'receipt_number', OLD.receipt_number),
    jsonb_build_object('status', 'INTENTO_BORRADO_RECHAZADO'),
    'ALERTA ANTIFRAUDE: Intento de eliminación física en libro mayor interceptado por el motor.',
    encode(digest(OLD.id::text || NOW()::text, 'sha256'), 'hex')
  );

  RAISE EXCEPTION 'FRAUDE BLOQUEADO: La tabla public.daily_ledger es inmutable (Append-Only). No se permite UPDATE ni DELETE.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_prevent_daily_ledger_tampering
BEFORE UPDATE OR DELETE ON public.daily_ledger
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
-- 15. GESTIÓN DE BASES SEMANALES PARA COBRADORES (COLLECTOR_BASES & RLS)
-- ==============================================================================
CREATE TABLE public.collector_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  week_start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVA' CHECK (status IN ('ACTIVA', 'DEVUELTA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HABILITAR ROW LEVEL SECURITY (RLS) EN COLLECTOR_BASES
ALTER TABLE public.collector_bases ENABLE ROW LEVEL SECURITY;

-- POLÍTICA 1 (SELECT): El Administrador/Socio ve todas las bases; el Cobrador solo ve la base asignada a su usuario
CREATE POLICY "collector_bases_select_policy" ON public.collector_bases
  FOR SELECT USING (
    public.is_admin_or_socio() OR
    collector_id = auth.uid()
  );

-- POLÍTICA 2 (INSERT): Exclusivamente el Administrador puede crear y asignar bases semanales
CREATE POLICY "collector_bases_insert_admin" ON public.collector_bases
  FOR INSERT WITH CHECK (
    public.is_admin()
  );

-- POLÍTICA 3 (UPDATE): Exclusivamente el Administrador puede cambiar el estado ('ACTIVA' -> 'DEVUELTA')
CREATE POLICY "collector_bases_update_admin" ON public.collector_bases
  FOR UPDATE USING (
    public.is_admin()
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
    link.download = 'supabase_rbac_microcredit_medellin.sql';
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
            <span className="text-xs text-slate-400 font-mono">RBAC & RLS Architecture v2.0</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            Esquema Supabase con RBAC Exclusivo para Administrador y Socios
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Tabla <code className="text-emerald-400">profiles</code>, funciones de rol <code className="text-blue-400">is_admin_or_socio()</code> y políticas RLS blindadas para gastos y flujo de caja.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-400" />
            Descargar .sql
          </button>
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all"
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
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
            activeTab === 'sql'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          Script SQL DDL & RLS Completo
        </button>

        <button
          onClick={() => setActiveTab('rbac_rls')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
            activeTab === 'rbac_rls'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          Matriz de Políticas RLS (Admin / Socios)
        </button>

        <button
          onClick={() => setActiveTab('tables')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
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
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
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
              Matriz de Control de Acceso por Roles (RBAC en PostgreSQL)
            </h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Row Level Security (RLS) intercepta las consultas a nivel de motor SQL. Incluso si un cobrador o atacante intercepta la API anon de Supabase con un token JWT de cobrador o cliente, las consultas sobre tablas sensibles devuelven <code className="text-emerald-400 font-mono">0 rows</code>.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="py-2.5 px-3">Tabla Sensible</th>
                    <th className="py-2.5 px-3">Operación</th>
                    <th className="py-2.5 px-3">Administrador (CFO)</th>
                    <th className="py-2.5 px-3">Socio Inversionista</th>
                    <th className="py-2.5 px-3">Cobrador en Calle</th>
                    <th className="py-2.5 px-3">Cliente Deudor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">public.route_expenses</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">SELECT</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">✓ Total (Todas las rutas)</td>
                    <td className="py-2.5 px-3 text-blue-400 font-semibold">✓ Total (Auditoría ROI)</td>
                    <td className="py-2.5 px-3 text-amber-400">Solo su turno activo</td>
                    <td className="py-2.5 px-3 text-rose-500 font-bold">✗ Denegado (0 rows)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">public.daily_cash_shifts</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">SELECT</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">✓ Arqueo de todas las comunas</td>
                    <td className="py-2.5 px-3 text-blue-400 font-semibold">✓ Visibilidad de liquidación</td>
                    <td className="py-2.5 px-3 text-amber-400">Solo turno personal</td>
                    <td className="py-2.5 px-3 text-rose-500 font-bold">✗ Denegado (0 rows)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">public.routes (Capital / OpEx)</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">SELECT</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">✓ Margen y Punto de Equilibrio</td>
                    <td className="py-2.5 px-3 text-blue-400 font-semibold">✓ Margen y Rentabilidad</td>
                    <td className="py-2.5 px-3 text-amber-400">Solo ruta asignada</td>
                    <td className="py-2.5 px-3 text-rose-500 font-bold">✗ Denegado (0 rows)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">public.audit_logs</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">SELECT</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">✓ Trazabilidad SHA-256 total</td>
                    <td className="py-2.5 px-3 text-blue-400 font-semibold">✓ Inspección de fraudes/ajustes</td>
                    <td className="py-2.5 px-3 text-rose-500 font-bold">✗ Denegado (0 rows)</td>
                    <td className="py-2.5 px-3 text-rose-500 font-bold">✗ Denegado (0 rows)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">public.profiles</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">UPDATE</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">✓ Gestión total de roles</td>
                    <td className="py-2.5 px-3 text-rose-500 font-bold">✗ Denegado (Solo lectura)</td>
                    <td className="py-2.5 px-3 text-rose-500 font-bold">✗ Denegado</td>
                    <td className="py-2.5 px-3 text-rose-500 font-bold">✗ Denegado</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Lock className="w-4 h-4" />
                Función is_admin_or_socio() (SECURITY DEFINER)
              </span>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Se ejecuta en el contexto de seguridad del creador para consultar <code className="text-slate-200 font-mono">public.profiles</code> sin incurrir en recursión infinita en las políticas RLS. Valida de forma atómica:
              </p>
              <pre className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-300">
{`SELECT EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() 
    AND role IN ('admin', 'socio') 
    AND is_active = TRUE
);`}
              </pre>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <span className="font-bold text-blue-400 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                Trigger on_auth_user_created
              </span>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Al registrar un nuevo usuario en <code className="text-slate-200 font-mono">auth.users</code> mediante Supabase Auth, este disparador crea automáticamente la fila correspondiente en <code className="text-slate-200 font-mono">public.profiles</code> asignándole rol y metadatos sin intervención manual:
              </p>
              <pre className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-[11px] text-blue-300">
{`CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`}
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
              desc: 'Tabla central de identidad vinculada a auth.users(id). Almacena el rol (admin, socio, cobrador, cliente) y el % de participación para dividendos.',
              keys: 'PK: id REFERENCES auth.users(id) | Role: user_role ENUM'
            },
            {
              name: 'routes',
              desc: 'Rutas territoriales y asignación de zonas (Comuna 13, Manrique, Belén, Itagüí). Define el límite máximo de cartera y gasto fijo.',
              keys: 'PK: id | Unique: code'
            },
            {
              name: 'collectors',
              desc: 'Operadores de calle vinculados a cuentas de usuario. Límite de desembolso diario y trazabilidad de dispositivo.',
              keys: 'PK: id | FK: assigned_route_id, user_id'
            },
            {
              name: 'clients',
              desc: 'Padrón de deudores hiper-local (nombre comercial, categoría del micronegocio, coordenadas GPS y datos del fiador solidario).',
              keys: 'PK: id | FK: route_id | Unique: document_number'
            },
            {
              name: 'daily_cash_shifts',
              desc: 'Turnos diarios de caja para arqueo ciego. Base física + Recaudo efectivo - Desembolsos - OpEx = Caja real entregada en sobre.',
              keys: 'PK: id | Unique: (route_id, shift_date)'
            },
            {
              name: 'loans',
              desc: 'Contratos de microcrédito activo. Capital, interés flat, número de días hábiles, cuota fija diaria y saldo insoluto restante.',
              keys: 'PK: id | FK: route_id, client_id, collector_id'
            },
            {
              name: 'daily_ledger',
              desc: 'Libro mayor inmutable (append-only). Cada abono registra saldo anterior, saldo nuevo, huella SHA-256 y coordenadas de recaudo.',
              keys: 'PK: id | FK: shift_id, loan_id, client_id'
            },
            {
              name: 'route_expenses',
              desc: 'Registro y auditoría de gastos de ruta (gasolina de moto, viático almuerzo, datos móviles Claro/Tigo, parqueaderos, imprevistos).',
              keys: 'PK: id | FK: shift_id, route_id, collector_id'
            }
          ].map((table) => (
            <div key={table.name} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-white text-sm bg-slate-800 px-2 py-0.5 rounded">
                  public.{table.name}
                </span>
                <span className="text-[10px] text-emerald-400 font-mono font-semibold">PostgreSQL</span>
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
            Fundamentos de Arquitectura Financiera & Control de Riesgos
          </h3>

          <div className="space-y-3">
            <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              <span className="font-bold text-emerald-400 block mb-1">
                1. Inmutabilidad Contable (Append-Only Ledger)
              </span>
              <p className="text-slate-300">
                Está estrictamente prohibido que un cobrador o API ejecute un <code className="text-amber-300">UPDATE public.loans SET remaining_balance = ...</code> directo. Todo descuento de saldo se produce únicamente mediante un registro <code className="text-emerald-300">INSERT INTO public.daily_ledger</code> que dispara un trigger transaccional atómico con bloqueo de fila (<code className="text-slate-200">FOR UPDATE</code>), garantizando cero discrepancias por concurrencia.
              </p>
            </div>

            <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              <span className="font-bold text-emerald-400 block mb-1">
                2. Eliminación de Jineteo mediante Arqueo Ciego Diario
              </span>
              <p className="text-slate-300">
                La tabla <code className="text-slate-200">daily_cash_shifts</code> calcula la columna virtual <code className="text-slate-200">expected_closing_cash</code> en el motor de la base de datos. El cobrador en calle reporta sus cobros y gastos en tiempo real; al entregar el sobre en la oficina, el auditor ingresa <code className="text-slate-200">actual_closing_cash</code>. Cualquier diferencia genera una alerta inmediata.
              </p>
            </div>

            <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              <span className="font-bold text-emerald-400 block mb-1">
                3. Absorción de Costos Logísticos de Calle (OpEx)
              </span>
              <p className="text-slate-300">
                La tabla <code className="text-slate-200">route_expenses</code> asegura que la rentabilidad neta no sea ficticia. El combustible, los pinchazos de motocicleta y las comidas en ruta se descuentan antes de transferir la utilidad al fondo de inversión.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
