import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Calendar,
  AlertTriangle,
  Flame,
  Zap,
  Play,
  Copy,
  Check,
  Database,
  Search,
  CheckCircle2,
  TrendingUp,
  ShieldAlert,
  Settings,
  Layers,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { ClientProfile, LoanDetail } from '../data/mockData';
import { formatCOP, roundCOP } from '../utils/financialCalculations';
import {
  PenaltySettings,
  OverduePenaltyAuditLog,
  CronExecutionResultSummary,
  DEFAULT_PENALTY_SETTINGS,
  getStoredOverduePenaltyAuditLogs,
  executeDailyOverduePenaltyCronJob,
} from '../utils/overduePenaltyCronService';

interface OverduePenaltyCronModuleProps {
  clients: ClientProfile[];
  loans: LoanDetail[];
  onApplyPenaltyUpdates?: (updatedLoans: LoanDetail[], updatedClients: ClientProfile[]) => void;
}

const SQL_CRON_MIGRATION_CODE = `-- =============================================================================
-- MÓDULO 5: MORA AUTOMÁTICA EN POSTGRESQL (EXTENSIÓN pg_cron + SCRIPT A MEDIANOCHE)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

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
AS $$
DECLARE
  v_rec RECORD;
  v_days_overdue INT;
  v_penalty NUMERIC;
  v_new_balance NUMERIC;
  v_new_risk TEXT;
  v_count INT := 0;
  v_sum NUMERIC := 0;
  v_critical INT := 0;
BEGIN
  FOR v_rec IN
    SELECT l.id AS loan_id, l.client_id, c.name AS client_name,
           l.remaining_balance, l.expected_end_date, l.status, l.daily_quota
      FROM public.loans l
      JOIN public.clients c ON c.id = l.client_id
     WHERE l.status IN ('active', 'activo', 'mora_severa') AND l.remaining_balance > 0
  LOOP
    v_days_overdue := GREATEST(0, (CURRENT_DATE - COALESCE(v_rec.expected_end_date::date, CURRENT_DATE)));
    IF v_days_overdue > 0 THEN
      v_penalty := ROUND(GREATEST(p_fixed_penalty_fee, (v_rec.daily_quota * (p_penalty_rate_percent / 100.0))), 0);
      v_new_balance := v_rec.remaining_balance + v_penalty;
      v_new_risk := CASE WHEN v_days_overdue >= 15 THEN 'mora_critica' WHEN v_days_overdue >= 7 THEN 'C_alto_riesgo' ELSE 'B_promedio' END;

      UPDATE public.loans SET remaining_balance = v_new_balance, status = CASE WHEN v_days_overdue >= 7 THEN 'mora_severa' ELSE status END WHERE id = v_rec.loan_id;
      UPDATE public.clients SET risk_level = v_new_risk WHERE id = v_rec.client_id;

      INSERT INTO public.overdue_penalties_log (loan_id, client_id, client_name, days_overdue, pre_remaining_balance, penalty_applied, post_remaining_balance, risk_level_assigned, execution_source)
      VALUES (v_rec.loan_id, v_rec.client_id, v_rec.client_name, v_days_overdue, v_rec.remaining_balance, v_penalty, v_new_balance, v_new_risk, 'pg_cron_midnight');

      v_count := v_count + 1; v_sum := v_sum + v_penalty;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_count, v_sum, v_critical;
END;
$$;

SELECT cron.schedule('evaluar_mora_diaria_medianoche', '0 0 * * *', 'SELECT public.fn_process_daily_overdue_penalties(1.5, 0);');`;

export const OverduePenaltyCronModule: React.FC<OverduePenaltyCronModuleProps> = ({
  clients,
  loans,
  onApplyPenaltyUpdates,
}) => {
  const [settings, setSettings] = useState<PenaltySettings>(DEFAULT_PENALTY_SETTINGS);
  const [auditLogs, setAuditLogs] = useState<OverduePenaltyAuditLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<OverduePenaltyAuditLog | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [lastSummary, setLastSummary] = useState<CronExecutionResultSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'audit_monitor' | 'sql_cron_script'>('audit_monitor');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  useEffect(() => {
    const logs = getStoredOverduePenaltyAuditLogs(loans, clients);
    setAuditLogs(logs);
    if (logs.length > 0 && !selectedLog) {
      setSelectedLog(logs[0]);
    }
  }, [loans, clients]);

  const overdueLoans = useMemo(() => {
    return loans.filter((l) => l.daysOverdue > 0 && l.remainingBalance > 0);
  }, [loans]);

  const stats = useMemo(() => {
    const totalOverdueCount = overdueLoans.length;
    const totalOverdueBalance = overdueLoans.reduce((acc, l) => acc + l.remainingBalance, 0);
    const criticalMoraCount = overdueLoans.filter((l) => l.daysOverdue >= 15).length;
    const totalPenaltiesCalculated = auditLogs.reduce((acc, log) => acc + log.penaltyApplied, 0);

    return {
      totalOverdueCount,
      totalOverdueBalance,
      criticalMoraCount,
      totalPenaltiesCalculated,
    };
  }, [overdueLoans, auditLogs]);

  const handleExecuteManualCron = async () => {
    setIsExecuting(true);
    setLastSummary(null);

    try {
      const res = await executeDailyOverduePenaltyCronJob({
        loans,
        clients,
        settings,
        executionSource: 'manual_admin_trigger',
      });

      setLastSummary(res.summary);
      const refreshed = getStoredOverduePenaltyAuditLogs(res.updatedLoans, res.updatedClients);
      setAuditLogs(refreshed);
      if (refreshed.length > 0) {
        setSelectedLog(refreshed[0]);
      }

      if (onApplyPenaltyUpdates) {
        onApplyPenaltyUpdates(res.updatedLoans, res.updatedClients);
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter(
      (log) =>
        log.clientName.toLowerCase().includes(q) ||
        log.loanId.toLowerCase().includes(q) ||
        log.executionSource.toLowerCase().includes(q)
    );
  }, [auditLogs, searchTerm]);

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_CRON_MIGRATION_CODE);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* CABECERA PRINCIPAL DEL MÓDULO 5 */}
      <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Módulo 5 · Mora Automática en Postgres (`pg_cron`)
              </span>
              <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-mono bg-slate-950 text-slate-300 border border-slate-800">
                0 0 * * * (00:00 COT / UTC)
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Recargo Automático Diario &amp; Clasificación PAR de Cartera
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              La extensión <code className="text-emerald-300 font-mono">pg_cron</code> ejecuta a medianoche la función{' '}
              <code className="text-emerald-300 font-mono">fn_process_daily_overdue_penalties</code>, identificando
              cuotas vencidas, aplicando el recargo por mora del{' '}
              <code className="text-emerald-300 font-mono">{settings.dailyPenaltyRatePercent}%</code> diario y
              actualizando automáticamente el perfil de riesgo del deudor en PostgreSQL.
            </p>
          </div>

          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('audit_monitor')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'audit_monitor'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Monitor &amp; Auditoría</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sql_cron_script')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'sql_cron_script'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Script pg_cron SQL</span>
            </button>
          </div>
        </div>

        {/* MÉTROLOGÍA DE EJECUCIÓN A MEDIANOCHE */}
        {lastSummary && (
          <div className="mt-4 p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs font-medium flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Ejecución Exitosa del Cron:</strong> Se procesaron{' '}
                <strong className="text-white">{lastSummary.processedLoansCount} préstamos</strong> en mora, aplicando{' '}
                <strong className="text-white">{formatCOP(lastSummary.totalPenaltiesAppliedSum)}</strong> en recargos
                diarios. ({lastSummary.criticalMoraCount} casos en mora crítica PAR 15+).
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-300 shrink-0">
              {new Date(lastSummary.executedAt).toLocaleTimeString('es-CO')}
            </span>
          </div>
        )}
      </div>

      {/* KPIS DE MORA Y CARTERA EN RIESGO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400 block">
              Préstamos en Mora
            </span>
            <span className="text-2xl font-black text-amber-400 font-mono mt-1 block">
              {stats.totalOverdueCount}
            </span>
            <span className="text-[11px] text-slate-400">
              Con días vencidos &gt; 0
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400 block">
              Saldo Afectado por Mora
            </span>
            <span className="text-xl sm:text-2xl font-black text-white font-mono mt-1 block">
              {formatCOP(stats.totalOverdueBalance)}
            </span>
            <span className="text-[11px] text-emerald-400">
              Sujeto a recargo del {settings.dailyPenaltyRatePercent}% diario
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400 block">
              Mora Crítica PAR 15+
            </span>
            <span className="text-2xl font-black text-rose-400 font-mono mt-1 block">
              {stats.criticalMoraCount}
            </span>
            <span className="text-[11px] text-rose-300">
              Clasificación D / Vetado
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400 block">
              Sanciones Recaudadas
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono mt-1 block">
              {formatCOP(stats.totalPenaltiesCalculated)}
            </span>
            <span className="text-[11px] text-slate-400">
              Registradas por pg_cron
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {activeTab === 'sql_cron_script' ? (
        /* PESTAÑA SCRIPT SQL PG_CRON */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                Script pg_cron para Supabase SQL Editor (20261028000005_pg_cron_overdue_penalties.sql)
              </h3>
              <p className="text-xs text-slate-400">
                Programa el cron job <code className="text-emerald-300 font-mono">evaluar_mora_diaria_medianoche</code> a
                las <code className="text-emerald-300 font-mono">0 0 * * *</code> (00:00).
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopySql}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedSql ? 'SQL Copiado' : 'Copiar Script SQL'}</span>
            </button>
          </div>
          <pre className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
            {SQL_CRON_MIGRATION_CODE}
          </pre>
        </div>
      ) : (
        /* PESTAÑA MONITOR DE AUDITORÍA Y SIMULADOR */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* PANEL IZQUIERDO (5 COLS): PARÁMETROS DEL CRON Y EJECUCIÓN MANUAL */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-emerald-400" />
                  Parámetros de Sanción pg_cron
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  Cron: 0 0 * * *
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">
                    Tasa Diaria de Recargo por Mora (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={settings.dailyPenaltyRatePercent}
                    onChange={(e) =>
                      setSettings({ ...settings, dailyPenaltyRatePercent: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500 font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Calculado como % sobre el valor de la cuota diaria programada.
                  </span>
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">
                    Recargo Fijo Adicional Diario ($ COP)
                  </label>
                  <input
                    type="number"
                    step="1000"
                    min="0"
                    value={settings.fixedDailyPenaltyFee}
                    onChange={(e) =>
                      setSettings({ ...settings, fixedDailyPenaltyFee: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">
                    Umbral de Mora Crítica (Días para PAR 15+)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settings.moraCriticalDaysThreshold}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        moraCriticalDaysThreshold: parseInt(e.target.value, 10) || 15,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleExecuteManualCron}
                disabled={isExecuting}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Evaluando Cartera a Medianoche en Postgres...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Ejecutar Cron Job de Mora (`fn_process_daily_overdue_penalties`)</span>
                  </>
                )}
              </button>
            </div>

            {/* INSPECTOR DE LOG SELECCIONADO */}
            {selectedLog && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
                <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold block">
                  Detalle de Sanción Aplicada por pg_cron
                </span>
                <h4 className="text-sm font-black text-white">{selectedLog.clientName}</h4>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Días de Mora</span>
                    <span className="font-mono font-bold text-amber-400">
                      {selectedLog.daysOverdue} días
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Recargo Aplicado</span>
                    <span className="font-mono font-bold text-emerald-400">
                      +{formatCOP(selectedLog.penaltyApplied)}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Saldo Anterior:</span>
                    <span className="text-white">{formatCOP(selectedLog.preRemainingBalance)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1">
                    <span className="text-emerald-400 font-bold">Nuevo Saldo:</span>
                    <span className="text-emerald-400 font-bold">
                      {formatCOP(selectedLog.postRemainingBalance)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* PANEL DERECHO (7 COLS): BITÁCORA DE AUDITORÍA DE RECIBOS Y SANCIONES */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  Bitácora en Vivo (`public.overdue_penalties_log`)
                </h3>
                <p className="text-xs text-slate-400">
                  Registro inmutable de recargos aplicados diariamente a medianoche.
                </p>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar deudor o ID de préstamo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-3 px-3">Deudor / Préstamo</th>
                    <th className="py-3 px-3">Días Mora</th>
                    <th className="py-3 px-3">Saldo Previo</th>
                    <th className="py-3 px-3">Recargo Diario</th>
                    <th className="py-3 px-3">Nuevo Saldo</th>
                    <th className="py-3 px-3">Origen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={`transition-colors cursor-pointer ${
                        selectedLog?.id === log.id ? 'bg-emerald-950/30' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-3">
                        <span className="font-bold text-white block">{log.clientName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{log.loanId}</span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-amber-400">
                        {log.daysOverdue} d
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {formatCOP(log.preRemainingBalance)}
                      </td>
                      <td className="py-3 px-3 font-mono text-emerald-400 font-bold">
                        +{formatCOP(log.penaltyApplied)}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-white">
                        {formatCOP(log.postRemainingBalance)}
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] text-sky-300">
                        {log.executionSource}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
