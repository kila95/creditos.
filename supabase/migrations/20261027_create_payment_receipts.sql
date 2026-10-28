-- ============================================================================
-- MIGRACIÓN DE SEGURIDAD ANTIFRAUDE:
-- 1. Creación de `payment_receipts`
-- 2. Endurecimiento RLS de Solo Lectura (SELECT) en `tenant_subscriptions` y `payment_receipts`
-- 3. Bloqueo total de INSERT / UPDATE / DELETE desde el cliente (exclusivo Service Role / Edge Function)
-- ============================================================================

-- 1. Tabla inmutable de comprobantes de pago SaaS
CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  reference TEXT NOT NULL UNIQUE,
  wompi_transaction_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'APPROVED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_tenant_created
  ON public.payment_receipts (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_wompi_tx_id
  ON public.payment_receipts (wompi_transaction_id);

-- ============================================================================
-- 2. HABILITAR ROW LEVEL SECURITY (RLS) EN AMBAS TABLAS FINANCIERAS SAAS
-- ============================================================================
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. REVOCAR PRIVILEGIOS DE ESCRITURA DIRECTA A ROLES CLIENTE (anon, authenticated)
-- Todo INSERT, UPDATE o DELETE queda restringido exclusivamente al `service_role`
-- utilizado dentro de la Edge Function `wompi-webhook`.
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON public.tenant_subscriptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_receipts FROM anon, authenticated;

GRANT SELECT ON public.tenant_subscriptions TO authenticated;
GRANT SELECT ON public.payment_receipts TO authenticated;

-- ============================================================================
-- 4. POLÍTICAS RLS DE SOLO LECTURA (SELECT) SOBRE SUS PROPIOS REGISTROS
-- ============================================================================

-- 4.1 Limpieza de políticas previas en `tenant_subscriptions`
DROP POLICY IF EXISTS "Admins can view their own tenant subscription" ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "Admins can update their own tenant subscription" ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "Admins can insert their own tenant subscription" ON public.tenant_subscriptions;

-- Política única de lectura para `tenant_subscriptions`
CREATE POLICY "Admins can view their own tenant subscription"
  ON public.tenant_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.organization_id::text = tenant_subscriptions.tenant_id
          OR p.id::text = tenant_subscriptions.tenant_id
        )
    )
  );

-- 4.2 Limpieza de políticas previas en `payment_receipts`
DROP POLICY IF EXISTS "Admins can view their own tenant payment receipts" ON public.payment_receipts;
DROP POLICY IF EXISTS "Admins can insert payment receipts" ON public.payment_receipts;
DROP POLICY IF EXISTS "Admins can update payment receipts" ON public.payment_receipts;

-- Política única de lectura para `payment_receipts`
CREATE POLICY "Admins can view their own tenant payment receipts"
  ON public.payment_receipts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.organization_id::text = payment_receipts.tenant_id
          OR p.id::text = payment_receipts.tenant_id
        )
    )
  );
