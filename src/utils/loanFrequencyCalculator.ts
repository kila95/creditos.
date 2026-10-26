import { LoanModality } from '../services/clientSyncService';

export interface LoanCalculationResult {
  principal: number;
  interestRate: number;
  totalInterest: number;
  totalToPay: number;
  numberOfInstallments: number;
  installmentValue: number;
  modality: LoanModality;
  unitLabelPlural: string;
  unitLabelSingular: string;
  frequencyBadgeLabel: string;
  estimatedDurationDays: number;
}

export const MODALITY_METADATA: Record<
  LoanModality,
  {
    label: string;
    unitSingular: string;
    unitPlural: string;
    defaultInstallments: number;
    daysPerInstallment: number;
    placeholder: string;
    examples: string;
  }
> = {
  diaria: {
    label: 'Diaria',
    unitSingular: 'día',
    unitPlural: 'días',
    defaultInstallments: 24,
    daysPerInstallment: 1,
    placeholder: 'Ej: 24 o 30',
    examples: 'Ej: 24 días hábiles o 30 días',
  },
  semanal: {
    label: 'Semanal',
    unitSingular: 'semana',
    unitPlural: 'semanas',
    defaultInstallments: 4,
    daysPerInstallment: 7,
    placeholder: 'Ej: 4, 8 o 12',
    examples: 'Ej: 4, 8 o 12 semanas',
  },
  quincenal: {
    label: 'Quincenal',
    unitSingular: 'quincena',
    unitPlural: 'quincenas',
    defaultInstallments: 2,
    daysPerInstallment: 15,
    placeholder: 'Ej: 2, 4 o 6',
    examples: 'Ej: 2, 4 o 6 quincenas',
  },
  mensual: {
    label: 'Mensual',
    unitSingular: 'mes',
    unitPlural: 'meses',
    defaultInstallments: 1,
    daysPerInstallment: 30,
    placeholder: 'Ej: 1, 3 o 6',
    examples: 'Ej: 1, 3 o 6 meses',
  },
};

/**
 * Convierte automáticamente el plazo cuando el usuario cambia la frecuencia de pago,
 * manteniendo la equivalencia temporal o aplicando el estándar de la modalidad elegida.
 */
export function convertInstallmentsOnModalityChange(
  previousModality: LoanModality,
  nextModality: LoanModality,
  currentInstallments: number
): number {
  if (previousModality === nextModality) {
    return Math.max(1, Math.round(currentInstallments || 1));
  }

  const prevMeta = MODALITY_METADATA[previousModality];
  const nextMeta = MODALITY_METADATA[nextModality];

  // Si el usuario tenía el valor por defecto de la modalidad anterior (ej: 24 días hábiles ≈ 1 mes comercial),
  // usar directamente el estándar equivalente de 1 mes en la nueva modalidad (4 semanas, 2 quincenas, 1 mes)
  const approxDays =
    previousModality === 'diaria' && currentInstallments === 24
      ? 30
      : Math.max(1, currentInstallments) * prevMeta.daysPerInstallment;

  if (nextModality === 'diaria' && approxDays === 30) {
    return 24; // Estándar microcrédito diario (24 cuotas)
  }

  const converted = Math.round(approxDays / nextMeta.daysPerInstallment);
  return Math.max(1, converted || nextMeta.defaultInstallments);
}

/**
 * Fórmula oficial de cálculo en tiempo real:
 * - Total a Pagar = Monto + (Monto * (Tasa / 100))
 * - Valor de la Cuota = Total a Pagar / Número de Cuotas (según frecuencia: días, semanas, quincenas o meses)
 */
export function calculateLoanSchedule(
  principalInput: number | string,
  interestRateInput: number | string,
  installmentsInput: number | string,
  modality: LoanModality
): LoanCalculationResult {
  const principal = Math.max(0, Number(principalInput) || 0);
  const interestRate = Math.max(0, Number(interestRateInput) || 0);
  const numberOfInstallments = Math.max(1, Math.round(Number(installmentsInput) || 1));
  const meta = MODALITY_METADATA[modality];

  const totalInterest = Math.round(principal * (interestRate / 100));
  const totalToPay = principal + totalInterest;
  const installmentValue =
    numberOfInstallments > 0 ? Math.round(totalToPay / numberOfInstallments) : 0;

  return {
    principal,
    interestRate,
    totalInterest,
    totalToPay,
    numberOfInstallments,
    installmentValue,
    modality,
    unitLabelPlural: meta.unitPlural,
    unitLabelSingular: meta.unitSingular,
    frequencyBadgeLabel: meta.label,
    estimatedDurationDays: numberOfInstallments * meta.daysPerInstallment,
  };
}
