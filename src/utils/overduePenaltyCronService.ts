import { supabase, isLiveSupabaseConfigured } from '../services/supabaseAuth';
import { LoanDetail, ClientProfile } from '../data/mockData';
import { roundCOP, formatCOP } from './financialCalculations';

export interface PenaltySettings {
  cronExpression: string; // '0 0 * * *' (A medianoche)
  dailyPenaltyRatePercent: number; // Ej: 1.5% diario
  fixedDailyPenaltyFee: number; // Ej: $0 COP o $5.000 COP
  moraCriticalDaysThreshold: number; // Ej: 15 días
}

export interface OverduePenaltyAuditLog {
  id: string;
  loanId: string;
  clientId: string;
  clientName: string;
  daysOverdue: number;
  preRemainingBalance: number;
  penaltyApplied: number;
  postRemainingBalance: number;
  riskLevelAssigned: string;
  executedAt: string;
  executionSource: 'pg_cron_midnight' | 'manual_admin_trigger';
}

export interface CronExecutionResultSummary {
  executedAt: string;
  processedLoansCount: number;
  totalPenaltiesAppliedSum: number;
  criticalMoraCount: number;
  executionSource: 'pg_cron_midnight' | 'manual_admin_trigger';
}

const OVERDUE_PENALTY_STORAGE_KEY = 'enruta_overdue_penalty_audit_logs_v1';

export const DEFAULT_PENALTY_SETTINGS: PenaltySettings = {
  cronExpression: '0 0 * * *',
  dailyPenaltyRatePercent: 1.5,
  fixedDailyPenaltyFee: 0,
  moraCriticalDaysThreshold: 15,
};

export function getStoredOverduePenaltyAuditLogs(
  loans: LoanDetail[] = [],
  clients: ClientProfile[] = []
): OverduePenaltyAuditLog[] {
  let savedLogs: OverduePenaltyAuditLog[] = [];
  try {
    const raw = localStorage.getItem(OVERDUE_PENALTY_STORAGE_KEY);
    if (raw) {
      savedLogs = JSON.parse(raw);
    }
  } catch {
    savedLogs = [];
  }

  if (savedLogs.length > 0) {
    return savedLogs.sort(
      (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
    );
  }

  // Si no hay ejecuciones guardadas aún, generar trazas semilla para préstamos en mora
  const seedLogs: OverduePenaltyAuditLog[] = loans
    .filter((l) => l.daysOverdue > 0 && l.remainingBalance > 0)
    .map((l, idx) => {
      const penaltyApplied = roundCOP(l.installmentAmount * 0.015 * Math.min(l.daysOverdue, 5));
      return {
        id: `pen-log-seed-${l.id}-${idx}`,
        loanId: l.id,
        clientId: l.clientId,
        clientName: l.clientName,
        daysOverdue: l.daysOverdue,
        preRemainingBalance: l.remainingBalance,
        penaltyApplied,
        postRemainingBalance: l.remainingBalance + penaltyApplied,
        riskLevelAssigned: l.daysOverdue >= 15 ? 'mora_critica' : 'C_alto_riesgo',
        executedAt: new Date(Date.now() - idx * 86400000).toISOString(),
        executionSource: 'pg_cron_midnight',
      };
    });

  return seedLogs;
}

/**
 * Ejecuta manualmente o mediante cron la evaluación de mora y recargos diarios
 */
export async function executeDailyOverduePenaltyCronJob(params: {
  loans: LoanDetail[];
  clients: ClientProfile[];
  settings?: PenaltySettings;
  executionSource?: 'pg_cron_midnight' | 'manual_admin_trigger';
}): Promise<{
  summary: CronExecutionResultSummary;
  auditLogs: OverduePenaltyAuditLog[];
  updatedLoans: LoanDetail[];
  updatedClients: ClientProfile[];
}> {
  const {
    loans,
    clients,
    settings = DEFAULT_PENALTY_SETTINGS,
    executionSource = 'manual_admin_trigger',
  } = params;
  const executedAt = new Date().toISOString();

  let processedCount = 0;
  let totalPenaltiesSum = 0;
  let criticalCount = 0;
  const newAuditLogs: OverduePenaltyAuditLog[] = [];

  const updatedLoansMap = new Map<string, LoanDetail>();
  loans.forEach((l) => updatedLoansMap.set(l.id, { ...l }));

  const updatedClientsMap = new Map<string, ClientProfile>();
  clients.forEach((c) => updatedClientsMap.set(c.id, { ...c }));

  // 1. Evaluar préstamos en mora
  for (const loan of loans) {
    if (loan.remainingBalance <= 0 || loan.status === 'liquidado') continue;

    // Calcular días en mora reales
    let daysOverdue = loan.daysOverdue;
    if (loan.dueDate && new Date(loan.dueDate).getTime() < Date.now()) {
      const diffMs = Date.now() - new Date(loan.dueDate).getTime();
      daysOverdue = Math.max(daysOverdue, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    if (daysOverdue > 0) {
      const calculatedPenalty = roundCOP(
        Math.max(
          settings.fixedDailyPenaltyFee,
          loan.installmentAmount * (settings.dailyPenaltyRatePercent / 100)
        )
      );

      const preBalance = loan.remainingBalance;
      const postBalance = roundCOP(preBalance + calculatedPenalty);

      let newRiskLevel = 'A_excelente';
      let newLoanStatus = loan.status;

      if (daysOverdue >= settings.moraCriticalDaysThreshold) {
        newRiskLevel = 'mora_critica';
        newLoanStatus = 'mora_severa';
        criticalCount++;
      } else if (daysOverdue >= 7) {
        newRiskLevel = 'C_alto_riesgo';
        newLoanStatus = 'mora_severa';
      } else if (daysOverdue >= 2) {
        newRiskLevel = 'B_promedio';
      }

      processedCount++;
      totalPenaltiesSum += calculatedPenalty;

      const auditLog: OverduePenaltyAuditLog = {
        id: `pen-log-${loan.id}-${Date.now()}`,
        loanId: loan.id,
        clientId: loan.clientId,
        clientName: loan.clientName,
        daysOverdue,
        preRemainingBalance: preBalance,
        penaltyApplied: calculatedPenalty,
        postRemainingBalance: postBalance,
        riskLevelAssigned: newRiskLevel,
        executedAt,
        executionSource,
      };

      newAuditLogs.push(auditLog);

      // Actualizar estado en memoria
      const existingLoan = updatedLoansMap.get(loan.id);
      if (existingLoan) {
        updatedLoansMap.set(loan.id, {
          ...existingLoan,
          remainingBalance: postBalance,
          daysOverdue,
          status: newLoanStatus as any,
        });
      }

      const existingClient = updatedClientsMap.get(loan.clientId);
      if (existingClient) {
        updatedClientsMap.set(loan.clientId, {
          ...existingClient,
          daysOverdue,
          riskTier:
            newRiskLevel === 'mora_critica'
              ? 'D_mora_critica'
              : newRiskLevel === 'C_alto_riesgo'
              ? 'C_alto_riesgo'
              : existingClient.riskTier,
        });
      }
    }
  }

  // 2. Si Supabase está activo, invocar la función RPC en la base de datos
  if (isLiveSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await supabase.rpc('fn_process_daily_overdue_penalties', {
        p_penalty_rate_percent: settings.dailyPenaltyRatePercent,
        p_fixed_penalty_fee: settings.fixedDailyPenaltyFee,
      });
    } catch (err) {
      console.warn('⚠️ [pg_cron RPC Notice]:', err);
    }
  }

  // 3. Persistir log de auditoría local
  try {
    const existingRaw = localStorage.getItem(OVERDUE_PENALTY_STORAGE_KEY);
    const existing: OverduePenaltyAuditLog[] = existingRaw ? JSON.parse(existingRaw) : [];
    const merged = [...newAuditLogs, ...existing].slice(0, 250);
    localStorage.setItem(OVERDUE_PENALTY_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore quota errors
  }

  const updatedLoans = Array.from(updatedLoansMap.values());
  const updatedClients = Array.from(updatedClientsMap.values());

  const summary: CronExecutionResultSummary = {
    executedAt,
    processedLoansCount: processedCount,
    totalPenaltiesAppliedSum: totalPenaltiesSum,
    criticalMoraCount: criticalCount,
    executionSource,
  };

  return {
    summary,
    auditLogs: newAuditLogs,
    updatedLoans,
    updatedClients,
  };
}
