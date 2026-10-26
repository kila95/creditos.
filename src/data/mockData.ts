export interface RouteData {
  id: string;
  code: string;
  name: string;
  zone: string;
  collectorName: string;
  collectorPhone: string;
  baseFloatingCapital: number;
  fixedDailyOpex: number; // Gasolina + Viático diario + Deprec. moto + Plan datos
  collectorCommissionRate: number; // % sobre recaudo
  targetRecoveryRate: number; // %
  activeLoansCount: number;
  totalPortfolio: number;
  dailyGrossExpected: number;
  dailyGrossCollected: number;
  dailyExpenses: number;
  par1Rate: number; // %
  par7Rate: number; // %
  par30Rate: number; // %
  status: 'activa' | 'en_auditoria';
}

export interface ClientProfile {
  id: string;
  name: string;
  tradeName: string;
  category: string;
  document: string;
  phone: string;
  address: string;
  neighborhood: string;
  routeId: string;
  riskTier: 'A_excelente' | 'B_promedio' | 'C_alto_riesgo' | 'D_mora_critica' | 'X_vetado';
  daysOverdue: number;
  hasPreventiveBlock: boolean;
  guarantorName: string;
  guarantorPhone: string;
  lat: number;
  lng: number;
}

export interface LoanDetail {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  tradeName: string;
  routeId: string;
  principal: number;
  interestRate: number; // Ej: 20% flat
  totalDebt: number;
  installmentAmount: number;
  termDays: number; // Número de cuotas / días
  modality?: 'diaria' | 'semanal' | 'quincenal' | 'mensual';
  installmentsPaid: number;
  totalCollected: number;
  remainingBalance: number;
  disbursedDate: string;
  dueDate: string;
  daysOverdue: number;
  status: 'activo' | 'liquidado' | 'mora_severa' | 'refinanciado';
  todayPaid: boolean;
}

export interface LedgerEntry {
  id: string;
  receiptNumber: string;
  loanId: string;
  clientId: string;
  clientName: string;
  routeId: string;
  amount: number;
  principalPortion: number;
  interestPortion: number;
  paymentMethod: 'efectivo' | 'nequi' | 'daviplata';
  preBalance: number;
  postBalance: number;
  timestamp: string;
  gpsLocation: string;
  hash: string;
}

export interface RouteExpenseItem {
  id: string;
  routeId: string;
  category: 'combustible_moto' | 'mantenimiento_moto' | 'alimentacion_viaticos' | 'telefonia_datos' | 'peajes_parqueaderos' | 'contingencia_territorial';
  amount: number;
  description: string;
  timestamp: string;
  isApproved: boolean;
}

export interface CollectorBase {
  id: string;
  collectorId: string;
  collectorName: string;
  routeId: string;
  amount: number;
  weekStartDate: string;
  status: 'ACTIVA' | 'DEVUELTA';
  createdAt: string;
}

export const INITIAL_ROUTES: RouteData[] = [
  {
    id: 'route-1',
    code: 'RUTA-MED-01',
    name: 'Comuna 13 - San Javier',
    zone: 'San Javier, 20 de Julio, El Salado',
    collectorName: 'Jhon Alexander Zapata',
    collectorPhone: '+57 314 555 9012',
    baseFloatingCapital: 0,
    fixedDailyOpex: 45000,
    collectorCommissionRate: 3.5,
    targetRecoveryRate: 95.0,
    activeLoansCount: 0,
    totalPortfolio: 0,
    dailyGrossExpected: 0,
    dailyGrossCollected: 0,
    dailyExpenses: 0,
    par1Rate: 0,
    par7Rate: 0,
    par30Rate: 0,
    status: 'activa'
  },
  {
    id: 'route-2',
    code: 'RUTA-MED-02',
    name: 'Manrique & Aranjuez (Nororiental)',
    zone: 'Manrique Central, Las Granjas, Aranjuez',
    collectorName: 'Carlos Mario Henao',
    collectorPhone: '+57 301 445 9932',
    baseFloatingCapital: 0,
    fixedDailyOpex: 50000,
    collectorCommissionRate: 4.0,
    targetRecoveryRate: 95.0,
    activeLoansCount: 0,
    totalPortfolio: 0,
    dailyGrossExpected: 0,
    dailyGrossCollected: 0,
    dailyExpenses: 0,
    par1Rate: 0,
    par7Rate: 0,
    par30Rate: 0,
    status: 'activa'
  }
];

export const INITIAL_CLIENTS: ClientProfile[] = [];

export const INITIAL_LOANS: LoanDetail[] = [];

export const INITIAL_LEDGER: LedgerEntry[] = [];

export const INITIAL_EXPENSES: RouteExpenseItem[] = [];

export const INITIAL_COLLECTOR_BASES: CollectorBase[] = [];


