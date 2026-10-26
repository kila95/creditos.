/**
 * MOTOR DE CÁLCULO FINANCIERO & CFO ANALYTICS
 * Microcréditos urbanos de alto riesgo y liquidación diaria (Gota a Gota)
 */

export interface LoanSimulationResult {
  principal: number;
  flatMonthlyRate: number; // Ej: 20%
  termDays: number; // Ej: 24 días hábiles
  totalInterest: number;
  totalDebt: number;
  dailyInstallment: number;
  dailyPrincipalPortion: number;
  dailyInterestPortion: number;
  implicitDailyRate: number; // % diario
  implicitTEA: number; // Tasa Efectiva Anual implícita (%)
  liquidityBufferRequired: number; // Colchón de liquidez sugerido (ej: 12% morosidad esperada)
}

/**
 * Simula un microcrédito bajo modalidad comercial habitual (Flat interés en cuotas fijas diarias)
 */
export function simulateMicroloan(
  principal: number,
  flatMonthlyRatePercent: number = 20,
  termDays: number = 24,
  expectedDefaultRate: number = 8.0 // 8% tasa de impago estimada
): LoanSimulationResult {
  const totalInterest = principal * (flatMonthlyRatePercent / 100);
  const totalDebt = principal + totalInterest;
  const dailyInstallment = Math.ceil(totalDebt / termDays);
  const dailyPrincipalPortion = principal / termDays;
  const dailyInterestPortion = totalInterest / termDays;

  // Tasa diaria equivalente simple
  const implicitDailyRate = (totalInterest / principal / termDays) * 100;

  // Tasa Efectiva Anual implícita considerando 300 días hábiles de rotación de capital al año:
  // TEA = (1 + r_diaria)^(300) - 1
  const dailyRateDecimal = (totalInterest / principal) / termDays;
  const implicitTEA = (Math.pow(1 + dailyRateDecimal, 300) - 1) * 100;

  // Fondo de Colchón de Liquidez Obligatorio para absorber días de impago
  // Cushion = Saldo expuesto * tasa de mora esperada
  const liquidityBufferRequired = principal * (expectedDefaultRate / 100);

  return {
    principal,
    flatMonthlyRate: flatMonthlyRatePercent,
    termDays,
    totalInterest,
    totalDebt,
    dailyInstallment,
    dailyPrincipalPortion,
    dailyInterestPortion,
    implicitDailyRate,
    implicitTEA,
    liquidityBufferRequired
  };
}

/**
 * Calcula el Margen Operativo Neto Diario (Net Cash Flow) según la directriz:
 * Net Cash Flow = Recaudo Bruto Diario - Gastos Operativos Asignados - Provisión para Cartera Incobrable
 */
export function calculateNetCashFlow(
  grossDailyCollection: number,
  assignedDailyExpenses: number,
  provisionRatePercent: number = 4.0 // 4% diario provisionado sobre recaudo o saldo
): {
  grossDailyCollection: number;
  assignedDailyExpenses: number;
  badDebtProvision: number;
  netCashFlow: number;
  netMarginPercent: number;
} {
  const badDebtProvision = grossDailyCollection * (provisionRatePercent / 100);
  const netCashFlow = grossDailyCollection - assignedDailyExpenses - badDebtProvision;
  const netMarginPercent = grossDailyCollection > 0 ? (netCashFlow / grossDailyCollection) * 100 : 0;

  return {
    grossDailyCollection,
    assignedDailyExpenses,
    badDebtProvision,
    netCashFlow,
    netMarginPercent
  };
}

/**
 * Calcula el Punto de Equilibrio de una Ruta:
 * Determina cuántos créditos activos al día se requieren para cubrir los costos fijos
 * ineludibles del cobrador (gasolina, viáticos, desgaste moto, telecomunicaciones)
 */
export function calculateRouteBreakEven(
  fixedDailyOpex: number, // Ej: $48,000 COP al día
  averageLoanPrincipal: number = 800000,
  flatMonthlyRate: number = 20,
  termDays: number = 24
): {
  fixedDailyOpex: number;
  dailyInterestYieldPerLoan: number;
  breakEvenActiveLoans: number;
  minPortfolioRequired: number;
} {
  // Interés total generado por crédito promedio
  const totalInterestPerLoan = averageLoanPrincipal * (flatMonthlyRate / 100);
  // Interés diario generado por cada crédito al día
  const dailyInterestYieldPerLoan = totalInterestPerLoan / termDays;

  // Cantidad de créditos al día para que el interés diario pague el gasto fijo diario
  const breakEvenActiveLoans = dailyInterestYieldPerLoan > 0 
    ? Math.ceil(fixedDailyOpex / dailyInterestYieldPerLoan) 
    : 0;

  const minPortfolioRequired = breakEvenActiveLoans * averageLoanPrincipal;

  return {
    fixedDailyOpex,
    dailyInterestYieldPerLoan,
    breakEvenActiveLoans,
    minPortfolioRequired
  };
}

/**
 * Formateador de moneda colombiana COP
 */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(amount);
}

export interface PartialPaymentDistribution {
  amountPaid: number;
  installmentAmount: number;
  dailyInterestDue: number; // Porción de interés esperada para la cuota diaria
  interestPortionCovered: number; // Cubre primero el interés diario
  principalPortionCovered: number; // El remanente amortiza directamente a capital
  unpaidInstallmentBalance: number; // Lo que faltó para completar la cuota del día
  preBalance: number;
  postBalance: number;
  isFullPayment: boolean;
  isPartialPayment: boolean;
  capitalRatio: number;
}

/**
 * MOTOR FINANCIERO: Distribución estricta de abonos parciales y liquidación diaria
 * Regla de amortización estricta:
 * 1. Primero se absorbe la porción de interés devengado del día (costo financiero).
 * 2. Si el abono supera el interés diario, el remanente se destina 100% a reducción de capital insoluto.
 * 3. Si el abono no alcanza a cubrir el interés del día, el 100% cubre interés parcial y el capital queda intacto.
 */
export function calculatePartialPaymentDistribution(
  amountPaid: number,
  installmentAmount: number,
  principalAmount: number,
  totalDebtAmount: number,
  currentRemainingBalance: number
): PartialPaymentDistribution {
  const interestRatio = (totalDebtAmount - principalAmount) / totalDebtAmount;
  const capitalRatio = principalAmount / totalDebtAmount;

  // Interés diario esperado en la cuota estándar
  const dailyInterestDue = Math.round(installmentAmount * interestRatio);

  let interestPortionCovered = 0;
  let principalPortionCovered = 0;

  if (amountPaid >= installmentAmount) {
    // Pago completo o mayor
    interestPortionCovered = dailyInterestDue;
    principalPortionCovered = amountPaid - dailyInterestDue;
  } else if (amountPaid <= dailyInterestDue) {
    // El abono ni siquiera cubre el interés del día: todo va a interés
    interestPortionCovered = amountPaid;
    principalPortionCovered = 0;
  } else {
    // El abono cubre el interés del día y amortiza el remanente a capital
    interestPortionCovered = dailyInterestDue;
    principalPortionCovered = amountPaid - dailyInterestDue;
  }

  const unpaidInstallmentBalance = Math.max(0, installmentAmount - amountPaid);
  const postBalance = Math.max(0, currentRemainingBalance - amountPaid);

  return {
    amountPaid,
    installmentAmount,
    dailyInterestDue,
    interestPortionCovered,
    principalPortionCovered,
    unpaidInstallmentBalance,
    preBalance: currentRemainingBalance,
    postBalance,
    isFullPayment: amountPaid >= installmentAmount,
    isPartialPayment: amountPaid < installmentAmount && amountPaid > 0,
    capitalRatio
  };
}

export interface ExtensionCalculationResult {
  currentTermDays: number;
  extensionDays: number;
  newTermDays: number;
  currentBalance: number;
  extensionFee: number;
  newRemainingBalance: number;
  newDailyInstallment: number;
  newDueDate: string;
}

/**
 * Motor de Prórrogas Operativas (Extensión de plazo)
 */
export function calculateLoanExtension(
  currentTermDays: number,
  extensionDays: number,
  currentBalance: number,
  applyFeePercent: number = 0
): ExtensionCalculationResult {
  const newTermDays = currentTermDays + extensionDays;
  const extensionFee = currentBalance * (applyFeePercent / 100);
  const newRemainingBalance = currentBalance + extensionFee;
  const newDailyInstallment = Math.ceil(newRemainingBalance / Math.max(1, extensionDays + 5));

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + extensionDays + 5);

  return {
    currentTermDays,
    extensionDays,
    newTermDays,
    currentBalance,
    extensionFee,
    newRemainingBalance,
    newDailyInstallment,
    newDueDate: dueDate.toISOString().split('T')[0]
  };
}
