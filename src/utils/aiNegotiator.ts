/**
 * MOTOR DE NEGOCIACIÓN FINANCIERA & ASISTENTE IA PARA COBRADORES
 * Estructuración de acuerdos de pago, cálculo de recargo moratorio y generación de pagaré digital
 */

import { ClientProfile, LoanDetail } from '../data/mockData';
import { formatCOP } from './financialCalculations';

export interface NegotiationProposal {
  id: string;
  clientName: string;
  tradeName: string;
  currentOverdueDays: number;
  originalDailyInstallment: number;
  proposedAction: 'cuota_doble_diferida' | 'extension_plazo' | 'abono_capital_congelacion';
  proposedInstallment: number;
  compensatoryInterestFee: number; // Recargo compensatorio justo
  newTotalDebt: number;
  newDueDate: string;
  riskEvaluation: string;
  formalAgreementDraft: string;
  isApprovedByAdmin: boolean;
}

/**
 * Genera una propuesta de acuerdo formal ante la solicitud de prórroga del deudor
 */
export function generateAiNegotiationProposal(
  client: ClientProfile,
  loan: LoanDetail,
  collectorNotes: string
): NegotiationProposal {
  const remaining = loan.remainingBalance;
  const daysOverdue = loan.daysOverdue;

  // Lógica financiera de reestructuración:
  // Se añade un recargo compensatorio del 3% sobre el saldo atrasado para absorber el costo de fondeo
  const compensatoryInterestFee = Math.round(loan.installmentAmount * 0.05 * Math.max(1, daysOverdue));
  const newTotalDebt = remaining + compensatoryInterestFee;
  
  // Plazo extraordinario: 6 días hábiles adicionales con cuota adaptada
  const newInstallment = Math.ceil(newTotalDebt / (loan.termDays - loan.installmentsPaid + 4));

  const newDueDate = new Date();
  newDueDate.setDate(newDueDate.getDate() + 10);
  const formattedDueDate = newDueDate.toISOString().split('T')[0];

  const riskEvaluation = client.daysOverdue <= 2 
    ? 'Riesgo Controlado: El negocio tiene flujo diario comprobable. Se recomienda aceptar promesa de pago para evitar que caiga en PAR-7 y no quemar el canal de recaudo.'
    : 'Riesgo Severo: El cliente acumula más de 3 días sin abonos. Exigir fiador solidario o retención preventiva de cupo antes de firmar el acuerdo.';

  const formalAgreementDraft = `ACUERDO TRANSACCIONAL DE PAGO EXTRAORDINARIO
Fecha: ${new Date().toLocaleDateString('es-CO')}
Deudor: ${client.name} (${client.document})
Establecimiento: ${client.tradeName} (${client.neighborhood})
Acreedor: RutaCapital OS / Fondo de Microcréditos Medellín

CLÁUSULA PRIMERA: El deudor reconoce adeudar la suma de ${formatCOP(remaining)}, más un recargo compensatorio por gestión de cobranza y mora de ${formatCOP(compensatoryInterestFee)}, para un nuevo saldo neto de ${formatCOP(newTotalDebt)}.
CLÁUSULA SEGUNDA: Se suspende provisionalmente la acción de cobro prejudicial y el reporte al fiador ${client.guarantorName}, acordándose el pago de cuotas reestructuradas de ${formatCOP(newInstallment)} diarios a partir del próximo día hábil.
CLÁUSULA TERCERA: El incumplimiento de una sola cuota de este acuerdo dejará sin efecto los beneficios y reactivará el cobro total inmediato por vía ejecutiva.`;

  return {
    id: `neg-${Date.now()}`,
    clientName: client.name,
    tradeName: client.tradeName,
    currentOverdueDays: daysOverdue,
    originalDailyInstallment: loan.installmentAmount,
    proposedAction: 'cuota_doble_diferida',
    proposedInstallment: newInstallment,
    compensatoryInterestFee,
    newTotalDebt,
    newDueDate: formattedDueDate,
    riskEvaluation,
    formalAgreementDraft,
    isApprovedByAdmin: false
  };
}
