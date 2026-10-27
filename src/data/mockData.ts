export interface RouteData {
  id: string;
  code: string;
  name: string;
  zone: string;
  organizationId?: string;
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
  organizationId?: string;
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
  organizationId?: string;
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
  organizationId?: string;
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
  organizationId?: string;
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
  organizationId?: string;
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
    organizationId: 'org-medellin-01',
    collectorName: 'Jhon Alexander Zapata',
    collectorPhone: '+57 314 555 9012',
    baseFloatingCapital: 0,
    fixedDailyOpex: 45000,
    collectorCommissionRate: 3.5,
    targetRecoveryRate: 95.0,
    activeLoansCount: 1,
    totalPortfolio: 1200000,
    dailyGrossExpected: 75000,
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
    organizationId: 'org-norte-02',
    collectorName: 'Carlos Mario Henao',
    collectorPhone: '+57 301 445 9932',
    baseFloatingCapital: 0,
    fixedDailyOpex: 50000,
    collectorCommissionRate: 4.0,
    targetRecoveryRate: 95.0,
    activeLoansCount: 1,
    totalPortfolio: 900000,
    dailyGrossExpected: 50000,
    dailyGrossCollected: 0,
    dailyExpenses: 0,
    par1Rate: 0,
    par7Rate: 0,
    par30Rate: 0,
    status: 'activa'
  }
];

export const INITIAL_CLIENTS: ClientProfile[] = [
  {
    id: 'cli-par30-01',
    name: 'Hernán Darío Gaviria',
    tradeName: 'Chatarrería y Reciclaje El Hueco',
    category: 'Reciclaje / Mayorista',
    document: '71384920',
    phone: '3104558891',
    address: 'Calle 48 # 53-18 Sector Maturin',
    neighborhood: 'Centro / El Hueco',
    routeId: 'route-1',
    organizationId: 'org-medellin-01',
    riskTier: 'D_mora_critica',
    daysOverdue: 36,
    hasPreventiveBlock: true,
    guarantorName: 'Luis Eduardo Gaviria',
    guarantorPhone: '3116789012',
    lat: 6.2498,
    lng: -75.5702
  },
  {
    id: 'cli-par30-02',
    name: 'Marta Cecilia Quintero',
    tradeName: 'Confecciones y Remates Manrique',
    category: 'Textil / Confección',
    document: '43589102',
    phone: '3147823340',
    address: 'Cra 45 # 72-14 La 45',
    neighborhood: 'Manrique & Aranjuez',
    routeId: 'route-2',
    organizationId: 'org-norte-02',
    riskTier: 'D_mora_critica',
    daysOverdue: 32,
    hasPreventiveBlock: true,
    guarantorName: 'Jorge Eliécer Quintero',
    guarantorPhone: '3004128890',
    lat: 6.2685,
    lng: -75.5521
  }
];

export const INITIAL_LOANS: LoanDetail[] = [
  {
    id: 'loan-par30-01',
    code: 'PREST-R1-8901',
    clientId: 'cli-par30-01',
    clientName: 'Hernán Darío Gaviria',
    tradeName: 'Chatarrería y Reciclaje El Hueco',
    routeId: 'route-1',
    organizationId: 'org-medellin-01',
    principal: 1500000,
    interestRate: 20,
    totalDebt: 1800000,
    installmentAmount: 75000,
    termDays: 24,
    modality: 'diaria',
    installmentsPaid: 8,
    totalCollected: 600000,
    remainingBalance: 1200000,
    disbursedDate: '2026-08-25',
    dueDate: '2026-09-20',
    daysOverdue: 36,
    status: 'mora_severa',
    todayPaid: false
  },
  {
    id: 'loan-par30-02',
    code: 'PREST-R2-7412',
    clientId: 'cli-par30-02',
    clientName: 'Marta Cecilia Quintero',
    tradeName: 'Confecciones y Remates Manrique',
    routeId: 'route-2',
    organizationId: 'org-norte-02',
    principal: 1000000,
    interestRate: 20,
    totalDebt: 1200000,
    installmentAmount: 50000,
    termDays: 24,
    modality: 'diaria',
    installmentsPaid: 6,
    totalCollected: 300000,
    remainingBalance: 900000,
    disbursedDate: '2026-08-29',
    dueDate: '2026-09-24',
    daysOverdue: 32,
    status: 'mora_severa',
    todayPaid: false
  }
];

export const INITIAL_LEDGER: LedgerEntry[] = [];

export const INITIAL_EXPENSES: RouteExpenseItem[] = [];

export const INITIAL_COLLECTOR_BASES: CollectorBase[] = [];
