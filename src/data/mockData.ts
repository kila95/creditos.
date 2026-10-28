export interface RouteData {
  id: string;
  code: string;
  name: string;
  zone: string;
  organizationId?: string;
  tenantId?: string;
  createdBy?: string;
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
  tenantId?: string;
  createdBy?: string;
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
  liquidationDate?: string;
  daysOverdue: number;
  tenantId?: string;
  createdBy?: string;
  status: 'activo' | 'liquidado' | 'liquidated' | 'completed' | 'mora_severa' | 'refinanciado';
  todayPaid: boolean;
  paymentDays?: number[]; // Días de cobro programados (0 = Dom, 1 = Lun, 2 = Mar, 3 = Mié, 4 = Jue, 5 = Vie, 6 = Sáb)
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
  paymentMethod: 'efectivo' | 'nequi' | 'bancolombia' | 'daviplata';
  preBalance: number;
  postBalance: number;
  timestamp: string;
  gpsLocation: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
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
  },
  {
    id: "cli-liq-01",
    name: "Gloria Estella Morales",
    tradeName: "Variedades y Abarrotes La Esquina",
    category: "Abarrotes / Víveres",
    document: "32456789",
    phone: "3127894561",
    address: "Cra 76 # 35-12 San Javier",
    neighborhood: "Comuna 13 - San Javier",
    routeId: "route-1",
    organizationId: "org-medellin-01",
    riskTier: "A_excelente",
    daysOverdue: 0,
    hasPreventiveBlock: false,
    guarantorName: "Jorge Iván Morales",
    guarantorPhone: "3118901234",
    lat: 6.2510,
    lng: -75.6130
  },
  {
    id: "cli-liq-02",
    name: "Carlos Mario Restrepo",
    tradeName: "Taller de Motos y Repuestos Don Mario",
    category: "Servicios / Mecánica",
    document: "70543210",
    phone: "3186543219",
    address: "Calle 44 # 82-45 La América",
    neighborhood: "La América / San Juan",
    routeId: "route-1",
    organizationId: "org-medellin-01",
    riskTier: "B_promedio",
    daysOverdue: 3,
    hasPreventiveBlock: false,
    guarantorName: "Luz Dary Restrepo",
    guarantorPhone: "3007654321",
    lat: 6.2480,
    lng: -75.6020
  },
  {
    id: "cli-liq-03",
    name: "Jhon Jairo Arboleda",
    tradeName: "Comidas Rápidas El Paisa Nocturno",
    category: "Restaurante / Comidas",
    document: "98765432",
    phone: "3159871234",
    address: "Cra 92 # 42B-10 Belencito",
    neighborhood: "Belencito Corazón",
    routeId: "route-1",
    organizationId: "org-medellin-01",
    riskTier: "C_alto_riesgo",
    daysOverdue: 12,
    hasPreventiveBlock: false,
    guarantorName: "Faber Arboleda",
    guarantorPhone: "3145678901",
    lat: 6.2390,
    lng: -75.6180
  },
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
    todayPaid: false,
    paymentDays: [1, 2, 3, 4, 5, 6]
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
    todayPaid: false,
    paymentDays: [1, 2, 3, 4, 5, 6]
  }
];

export const INITIAL_LEDGER: LedgerEntry[] = [];

export const INITIAL_EXPENSES: RouteExpenseItem[] = [];

export const INITIAL_COLLECTOR_BASES: CollectorBase[] = [];
