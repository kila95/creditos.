/**
 * MOTOR DE CÁLCULO FINANCIERO & CFO ANALYTICS
 * Microcréditos urbanos de alto riesgo y liquidación diaria (Gota a Gota)
 * Todos los cálculos operan en números enteros exactos en Pesos Colombianos (COP).
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
  liquidityBufferRequired: number; // Colchón de liquidez sugerido
}

/**
 * Redondea cualquier valor numérico al entero exacto más cercano en Pesos Colombianos (COP)
 */
export function roundCOP(amount: number | string): number {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric);
}

/**
 * Valida que un pago o abono sea un entero positivo y NO supere el saldo pendiente actual del cliente
 */
export function validatePaymentAmount(
  amount: number,
  remainingBalance: number
): { isValid: boolean; sanitizedAmount: number; errorMessage: string | null } {
  const cleanAmount = roundCOP(amount);
  const cleanBalance = Math.max(0, roundCOP(remainingBalance));

  if (cleanAmount <= 0) {
    return {
      isValid: false,
      sanitizedAmount: cleanAmount,
      errorMessage: 'El monto del pago debe ser mayor a $0 COP.',
    };
  }

  if (cleanAmount > cleanBalance) {
    return {
      isValid: false,
      sanitizedAmount: cleanAmount,
      errorMessage: `El pago ingresado (${formatCOP(cleanAmount)}) no puede superar el saldo pendiente actual del cliente (${formatCOP(cleanBalance)}).`,
    };
  }

  return {
    isValid: true,
    sanitizedAmount: cleanAmount,
    errorMessage: null,
  };
}

/**
 * Simula un microcrédito bajo modalidad comercial habitual (Flat interés en cuotas fijas enteras COP)
 */
export function simulateMicroloan(
  principal: number,
  flatMonthlyRatePercent: number = 20,
  termDays: number = 24,
  expectedDefaultRate: number = 8.0
): LoanSimulationResult {
  const safePrincipal = Math.max(0, roundCOP(principal));
  const safeTerm = Math.max(1, roundCOP(termDays));
  const totalInterest = roundCOP(safePrincipal * (flatMonthlyRatePercent / 100));
  const totalDebt = safePrincipal + totalInterest;
  const dailyInstallment = roundCOP(totalDebt / safeTerm);
  const dailyPrincipalPortion = roundCOP(safePrincipal / safeTerm);
  const dailyInterestPortion = Math.max(0, dailyInstallment - dailyPrincipalPortion);

  // Tasa diaria equivalente simple
  const implicitDailyRate =
    safePrincipal > 0 ? (totalInterest / safePrincipal / safeTerm) * 100 : 0;

  // Tasa Efectiva Anual implícita considerando 300 días hábiles de rotación de capital al año
  const dailyRateDecimal = safePrincipal > 0 ? totalInterest / safePrincipal / safeTerm : 0;
  const implicitTEA = (Math.pow(1 + dailyRateDecimal, 300) - 1) * 100;

  // Fondo de Colchón de Liquidez Obligatorio en enteros COP
  const liquidityBufferRequired = roundCOP(safePrincipal * (expectedDefaultRate / 100));

  return {
    principal: safePrincipal,
    flatMonthlyRate: flatMonthlyRatePercent,
    termDays: safeTerm,
    totalInterest,
    totalDebt,
    dailyInstallment,
    dailyPrincipalPortion,
    dailyInterestPortion,
    implicitDailyRate,
    implicitTEA,
    liquidityBufferRequired,
  };
}

/**
 * Calcula el Margen Operativo Neto Diario (Net Cash Flow) en enteros exactos COP:
 * Net Cash Flow = Recaudo Bruto Diario - Gastos Operativos Asignados - Provisión para Cartera Incobrable
 */
export function calculateNetCashFlow(
  grossDailyCollection: number,
  assignedDailyExpenses: number,
  provisionRatePercent: number = 4.0
): {
  grossDailyCollection: number;
  assignedDailyExpenses: number;
  badDebtProvision: number;
  netCashFlow: number;
  netMarginPercent: number;
} {
  const safeGross = roundCOP(grossDailyCollection);
  const safeExpenses = roundCOP(assignedDailyExpenses);
  const badDebtProvision = roundCOP(safeGross * (provisionRatePercent / 100));
  const netCashFlow = safeGross - safeExpenses - badDebtProvision;
  const netMarginPercent = safeGross > 0 ? (netCashFlow / safeGross) * 100 : 0;

  return {
    grossDailyCollection: safeGross,
    assignedDailyExpenses: safeExpenses,
    badDebtProvision,
    netCashFlow,
    netMarginPercent,
  };
}

/**
 * Calcula el Punto de Equilibrio de una Ruta en enteros exactos COP
 */
export function calculateRouteBreakEven(
  fixedDailyOpex: number,
  averageLoanPrincipal: number = 800000,
  flatMonthlyRate: number = 20,
  termDays: number = 24
): {
  fixedDailyOpex: number;
  dailyInterestYieldPerLoan: number;
  breakEvenActiveLoans: number;
  minPortfolioRequired: number;
} {
  const safeOpex = roundCOP(fixedDailyOpex);
  const safeAvgPrincipal = roundCOP(averageLoanPrincipal);
  const safeTerm = Math.max(1, roundCOP(termDays));

  const totalInterestPerLoan = roundCOP(safeAvgPrincipal * (flatMonthlyRate / 100));
  const dailyInterestYieldPerLoan = Math.max(1, roundCOP(totalInterestPerLoan / safeTerm));

  const breakEvenActiveLoans =
    dailyInterestYieldPerLoan > 0 ? Math.ceil(safeOpex / dailyInterestYieldPerLoan) : 0;

  const minPortfolioRequired = breakEvenActiveLoans * safeAvgPrincipal;

  return {
    fixedDailyOpex: safeOpex,
    dailyInterestYieldPerLoan,
    breakEvenActiveLoans,
    minPortfolioRequired,
  };
}

/**
 * Formateador de moneda colombiana COP (Siempre números enteros exactos sin decimales)
 */
export function formatCOP(amount: number): string {
  const integerAmount = roundCOP(amount);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(integerAmount);
}

export interface PartialPaymentDistribution {
  amountPaid: number;
  installmentAmount: number;
  dailyInterestDue: number;
  interestPortionCovered: number;
  principalPortionCovered: number;
  unpaidInstallmentBalance: number;
  preBalance: number;
  postBalance: number;
  isFullPayment: boolean;
  isPartialPayment: boolean;
  exceedsBalance: boolean;
  capitalRatio: number;
}

/**
 * MOTOR FINANCIERO: Distribución estricta de abonos parciales y liquidación diaria en enteros COP
 */
export function calculatePartialPaymentDistribution(
  amountPaid: number,
  installmentAmount: number,
  principalAmount: number,
  totalDebtAmount: number,
  currentRemainingBalance: number
): PartialPaymentDistribution {
  const cleanPaid = Math.max(0, roundCOP(amountPaid));
  const cleanInstallment = Math.max(1, roundCOP(installmentAmount));
  const cleanPrincipal = Math.max(1, roundCOP(principalAmount));
  const cleanTotalDebt = Math.max(cleanPrincipal, roundCOP(totalDebtAmount));
  const cleanRemaining = Math.max(0, roundCOP(currentRemainingBalance));

  const interestRatio = (cleanTotalDebt - cleanPrincipal) / cleanTotalDebt;
  const capitalRatio = cleanPrincipal / cleanTotalDebt;

  // Interés diario esperado en la cuota estándar (entero exacto COP)
  const dailyInterestDue = roundCOP(cleanInstallment * interestRatio);

  let interestPortionCovered = 0;
  let principalPortionCovered = 0;

  if (cleanPaid >= cleanInstallment) {
    interestPortionCovered = dailyInterestDue;
    principalPortionCovered = cleanPaid - dailyInterestDue;
  } else if (cleanPaid <= dailyInterestDue) {
    interestPortionCovered = cleanPaid;
    principalPortionCovered = 0;
  } else {
    interestPortionCovered = dailyInterestDue;
    principalPortionCovered = cleanPaid - dailyInterestDue;
  }

  const unpaidInstallmentBalance = Math.max(0, cleanInstallment - cleanPaid);
  const postBalance = Math.max(0, cleanRemaining - cleanPaid);
  const exceedsBalance = cleanPaid > cleanRemaining;

  return {
    amountPaid: cleanPaid,
    installmentAmount: cleanInstallment,
    dailyInterestDue,
    interestPortionCovered: roundCOP(interestPortionCovered),
    principalPortionCovered: roundCOP(principalPortionCovered),
    unpaidInstallmentBalance: roundCOP(unpaidInstallmentBalance),
    preBalance: cleanRemaining,
    postBalance: roundCOP(postBalance),
    isFullPayment: cleanPaid >= cleanInstallment && !exceedsBalance,
    isPartialPayment: cleanPaid < cleanInstallment && cleanPaid > 0 && !exceedsBalance,
    exceedsBalance,
    capitalRatio,
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
 * Motor de Prórrogas Operativas (Extensión de plazo en enteros COP)
 */
export function calculateLoanExtension(
  currentTermDays: number,
  extensionDays: number,
  currentBalance: number,
  applyFeePercent: number = 0
): ExtensionCalculationResult {
  const safeCurrentTerm = roundCOP(currentTermDays);
  const safeExtDays = roundCOP(extensionDays);
  const safeBalance = roundCOP(currentBalance);

  const newTermDays = safeCurrentTerm + safeExtDays;
  const extensionFee = roundCOP(safeBalance * (applyFeePercent / 100));
  const newRemainingBalance = safeBalance + extensionFee;
  const newDailyInstallment = roundCOP(newRemainingBalance / Math.max(1, safeExtDays + 5));

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + safeExtDays + 5);

  return {
    currentTermDays: safeCurrentTerm,
    extensionDays: safeExtDays,
    newTermDays,
    currentBalance: safeBalance,
    extensionFee,
    newRemainingBalance,
    newDailyInstallment,
    newDueDate: dueDate.toISOString().split('T')[0],
  };
}

