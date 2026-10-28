-- =============================================================================
-- MÓDULO 5: MORA AUTOMÁTICA EN POSTGRESQL (EXTENSIÓN pg_cron + SCRIPT A MEDIANOCHE)
-- =============================================================================

-- 1. Habilitar la extensión pg_cron en Supabase / PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. Tabla de auditoría inmutable de sanciones e intereses de mora aplicados
CREATE TABLE IF NOT EXISTS public.overdue_penalties_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  days_overdue INT NOT NULL DEFAULT 0,
  pre_remaining_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  penalty_applied NUMERIC(15, 2) NOT NULL DEFAULT 0,
  post_remaining_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  risk_level_assigned TEXT NOT NULL DEFAULT 'verde',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  execution_source TEXT NOT NULL DEFAULT 'pg_cron_midnight'
);

CREATE INDEX IF NOT EXISTS idx_overdue_penalties_executed_at
  ON public.overdue_penalties_log (executed_at DESC);

-- 3. Función PL/pgSQL que evalúa cuotas vencidas y aplica penalidades diarias a medianoche
CREATE OR REPLACE FUNCTION public.fn_process_daily_overdue_penalties(
  p_penalty_rate_percent NUMERIC DEFAULT 1.5,
  p_fixed_penalty_fee NUMERIC DEFAULT 0
)
RETURNS TABLE (
  processed_loans_count INT,
  total_penalties_sum NUMERIC,
  critical_mora_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rec RECORD;
  v_days_overdue INT;
  v_penalty NUMERIC;
  v_new_balance NUMERIC;
  v_new_risk TEXT;
  v_new_status TEXT;
  v_count INT := 0;
  v_sum NUMERIC := 0;
  v_critical INT := 0;
BEGIN
  FOR v_rec IN
    SELECT l.id AS loan_id,
           l.client_id,
           c.name AS client_name,
           l.remaining_balance,
           l.expected_end_date,
           l.last_payment_date,
           l.status,
           l.daily_quota
      FROM public.loans l
      JOIN public.clients c ON c.id = l.client_id
     WHERE l.status IN ('active', 'activo', 'mora_severa')
       AND l.remaining_balance > 0
  LOOP
    -- Calcular días en mora comparando con la fecha esperada de vencimiento
    v_days_overdue := GREATEST(0, (CURRENT_DATE - COALESCE(v_rec.expected_end_date::date, CURRENT_DATE)));

    IF v_days_overdue > 0 THEN
      -- Calcular penalidad diaria (porcentaje de cuota diaria o valor fijo de recargo)
      v_penalty := ROUND(GREATEST(p_fixed_penalty_fee, (v_rec.daily_quota * (p_penalty_rate_percent / 100.0))), 0);
      v_new_balance := v_rec.remaining_balance + v_penalty;

      -- Clasificación de Riesgo PAR (Portfolio at Risk)
      IF v_days_overdue >= 15 THEN
        v_new_risk := 'mora_critica';
        v_new_status := 'mora_severa';
        v_critical := v_critical + 1;
      ELSIF v_days_overdue >= 7 THEN
        v_new_risk := 'C_alto_riesgo';
        v_new_status := 'mora_severa';
      ELSIF v_days_overdue >= 2 THEN
        v_new_risk := 'B_promedio';
        v_new_status := v_rec.status;
      ELSE
        v_new_risk := 'A_excelente';
        v_new_status := v_rec.status;
      END IF;

      -- Actualizar préstamo
      UPDATE public.loans
         SET remaining_balance = v_new_balance,
             status = v_new_status,
             updated_at = NOW()
       WHERE id = v_rec.loan_id;

      -- Actualizar perfil de riesgo del cliente
      UPDATE public.clients
         SET risk_level = v_new_risk,
             updated_at = NOW()
       WHERE id = v_rec.client_id;

      -- Registrar auditoría inmutable
      INSERT INTO public.overdue_penalties_log (
        loan_id,
        client_id,
        client_name,
        days_overdue,
        pre_remaining_balance,
        penalty_applied,
        post_remaining_balance,
        risk_level_assigned,
        execution_source
      ) VALUES (
        v_rec.loan_id,
        v_rec.client_id,
        v_rec.client_name,
        v_days_overdue,
        v_rec.remaining_balance,
        v_penalty,
        v_new_balance,
        v_new_risk,
        'pg_cron_midnight'
      );

      v_count := v_count + 1;
      v_sum := v_sum + v_penalty;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_count, v_sum, v_critical;
END;
$$;

-- 4. Programar el Cron Job diario a las 00:00 COT / UTC (0 0 * * *)
SELECT cron.unschedule('evaluar_mora_diaria_medianoche') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluar_mora_diaria_medianoche');

SELECT cron.schedule(
  'evaluar_mora_diaria_medianoche',
  '0 0 * * *',
  'SELECT public.fn_process_daily_overdue_penalties(1.5, 0);'
);
