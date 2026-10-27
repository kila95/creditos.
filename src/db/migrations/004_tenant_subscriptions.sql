-- ==============================================================================
-- ESQUEMA DE SUSCRIPCIONES SAAS Y CONTROL DE ACCESO SERVER-TO-SERVER (RLS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL UNIQUE,                       -- ID del fondo/organización (ej: 'org-medellin-01')
  admin_id TEXT NOT NULL,                               -- UID del Administrador dueño del fondo
  admin_email TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'pro_ruta',           -- 'basico', 'pro_ruta', 'empresa'
  status TEXT NOT NULL DEFAULT 'past_due'               -- 'active' | 'past_due' | 'canceled'
    CHECK (status IN ('active', 'past_due', 'canceled')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,              -- Fecha límite de corte y bloqueo
  payment_gateway_id TEXT,                              -- Stripe Subscription ID ('sub_...') o MP ID
  payment_gateway_provider TEXT NOT NULL DEFAULT 'stripe'
    CHECK (payment_gateway_provider IN ('stripe', 'mercadopago')),
  monthly_fee_cop NUMERIC(14, 2) NOT NULL DEFAULT 180000.00,
  routes_quota INTEGER NOT NULL DEFAULT 1,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  last_payment_date TIMESTAMPTZ,
  last_payment_amount_cop NUMERIC(14, 2),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_id 
  ON public.tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status 
  ON public.tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_gateway 
  ON public.tenant_subscriptions(payment_gateway_id);

-- ------------------------------------------------------------------------------
-- POLÍTICAS RLS ESTRICTAS (ZERO-TRUST: SOLO LECTURA PARA ADMINS)
-- Los Administradores solo pueden LEER su suscripción.
-- Solo la Edge Function (service_role) puede INSERTAR o ACTUALIZAR.
-- ------------------------------------------------------------------------------
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

-- 1. Política SELECT: El admin solo puede ver la suscripción vinculada a su tenant_id
DROP POLICY IF EXISTS "tenant_subscriptions_select_policy" ON public.tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_select_policy" ON public.tenant_subscriptions
FOR SELECT
USING (
  -- Super admin ve todas; Administrador solo ve la suya
  (SELECT role FROM public.profiles WHERE id = auth.uid()::text) = 'super_admin'
  OR tenant_id = public.get_current_user_tenant_id()
  OR admin_id = auth.uid()::text
);

-- 2. BLOQUEO TOTAL DE ESCRITURA PARA USUARIOS FINALES
-- No se crean políticas para INSERT, UPDATE o DELETE para el rol 'authenticated'.
-- En Supabase / Postgres RLS, la ausencia de políticas de escritura implica
-- DENEGACIÓN POR DEFECTO (Default Deny). Solo el token 'service_role' (Webhooks)
-- que opera con bypass RLS tiene autorización para actualizar el status.
