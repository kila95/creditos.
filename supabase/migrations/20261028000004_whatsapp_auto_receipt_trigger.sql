-- =============================================================================
-- MÓDULO 4: WHATSAPP AUTOMÁTICO (POSTGRESQL TRIGGER + PG_NET -> EDGE FUNCTION)
-- Detecta cada nuevo abono en public.daily_ledger y dispara asíncronamente
-- la Edge Function `whatsapp-payment-receipt` integrada con Meta Cloud API.
-- =============================================================================

-- 1. Habilitar la extensión pg_net para peticiones HTTP asíncronas desde Postgres
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Tabla de bitácora y auditoría de comprobantes enviados por WhatsApp Cloud API
CREATE TABLE IF NOT EXISTS public.whatsapp_receipt_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id TEXT NOT NULL,
  receipt_number TEXT NOT NULL,
  loan_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  wamid TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED_TRIGGER',
  meta_payload JSONB,
  meta_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_receipt_logs_created_at
  ON public.whatsapp_receipt_logs (created_at DESC);

-- 3. Función Trigger en PL/pgSQL que resuelve el teléfono del deudor e invoca la Edge Function
CREATE OR REPLACE FUNCTION public.fn_trigger_whatsapp_payment_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_client_phone TEXT;
  v_edge_function_url TEXT;
  v_service_role_key TEXT;
  v_payload JSONB;
BEGIN
  -- Obtener el teléfono celular del cliente desde public.clients
  SELECT phone
    INTO v_client_phone
    FROM public.clients
   WHERE id = NEW.client_id
   LIMIT 1;

  -- URL de la Edge Function del proyecto Supabase
  v_edge_function_url := COALESCE(
    current_setting('app.settings.supabase_edge_url', true),
    'https://PROJECT_REF.supabase.co/functions/v1/whatsapp-payment-receipt'
  );

  v_service_role_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    'SUPABASE_SERVICE_ROLE_KEY'
  );

  -- Construir payload JSON estandarizado para la Edge Function
  v_payload := jsonb_build_object(
    'type', 'INSERT',
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', jsonb_build_object(
      'id', NEW.id,
      'receipt_number', NEW.receipt_number,
      'loan_id', NEW.loan_id,
      'client_id', NEW.client_id,
      'client_name', NEW.client_name,
      'client_phone', COALESCE(v_client_phone, ''),
      'route_id', NEW.route_id,
      'amount', NEW.amount,
      'principal_portion', NEW.principal_portion,
      'interest_portion', NEW.interest_portion,
      'payment_method', NEW.payment_method,
      'pre_balance', NEW.pre_balance,
      'post_balance', NEW.post_balance,
      'timestamp', NEW.timestamp,
      'hash', NEW.hash
    )
  );

  -- Disparo HTTP POST asíncrono no bloqueante mediante pg_net
  PERFORM net.http_post(
    url := v_edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := v_payload
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Garantizar que un fallo de red externo jamás revierta el INSERT contable del abono
    RAISE WARNING '[Trigger WhatsApp] Aviso al invocar Edge Function: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 4. Vincular el Trigger AFTER INSERT a la tabla contable de abonos (public.daily_ledger)
DROP TRIGGER IF EXISTS trg_after_insert_payment_whatsapp ON public.daily_ledger;

CREATE TRIGGER trg_after_insert_payment_whatsapp
  AFTER INSERT ON public.daily_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trigger_whatsapp_payment_receipt();
