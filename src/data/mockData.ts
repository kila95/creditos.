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
  interestRate: number; // Ej: 20% flat a 24 días
  totalDebt: number;
  installmentAmount: number;
  termDays: number;
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

export const INITIAL_ROUTES: RouteData[] = [
  {
    id: 'route-1',
    code: 'RUTA-MED-01',
    name: 'Comuna 13 - San Javier',
    zone: 'San Javier, 20 de Julio, El Salado',
    collectorName: 'Julián Montoya',
    collectorPhone: '+57 312 849 2011',
    baseFloatingCapital: 300000,
    fixedDailyOpex: 45000, // 20k gasolina + 15k viático + 10k amortización moto/datos
    collectorCommissionRate: 3.5,
    targetRecoveryRate: 94.0,
    activeLoansCount: 42,
    totalPortfolio: 32500000,
    dailyGrossExpected: 1450000,
    dailyGrossCollected: 1380000,
    dailyExpenses: 48000,
    par1Rate: 4.8,
    par7Rate: 2.1,
    par30Rate: 0.9,
    status: 'activa'
  },
  {
    id: 'route-2',
    code: 'RUTA-MED-02',
    name: 'Manrique & Aranjuez (Nororiental)',
    zone: 'Manrique Central, Las Granjas, Aranjuez',
    collectorName: 'Carlos Mario Henao',
    collectorPhone: '+57 301 445 9932',
    baseFloatingCapital: 400000,
    fixedDailyOpex: 50000,
    collectorCommissionRate: 4.0,
    targetRecoveryRate: 92.5,
    activeLoansCount: 38,
    totalPortfolio: 28400000,
    dailyGrossExpected: 1280000,
    dailyGrossCollected: 1140000,
    dailyExpenses: 52000,
    par1Rate: 7.2,
    par7Rate: 3.8,
    par30Rate: 1.5,
    status: 'activa'
  },
  {
    id: 'route-3',
    code: 'RUTA-MED-03',
    name: 'Belén & Guayabal (Suroccidente)',
    zone: 'Belén Rincón, Parque Belén, Guayabal',
    collectorName: 'Mateo Restrepo',
    collectorPhone: '+57 314 772 1088',
    baseFloatingCapital: 350000,
    fixedDailyOpex: 42000,
    collectorCommissionRate: 3.0,
    targetRecoveryRate: 96.0,
    activeLoansCount: 45,
    totalPortfolio: 36000000,
    dailyGrossExpected: 1620000,
    dailyGrossCollected: 1580000,
    dailyExpenses: 43000,
    par1Rate: 3.1,
    par7Rate: 1.2,
    par30Rate: 0.4,
    status: 'activa'
  },
  {
    id: 'route-4',
    code: 'RUTA-MED-04',
    name: 'Itagüí Centro & Mayorista',
    zone: 'Centro Itagüí, Plaza Mayorista',
    collectorName: 'Andrés Zapata',
    collectorPhone: '+57 320 631 7744',
    baseFloatingCapital: 500000,
    fixedDailyOpex: 55000,
    collectorCommissionRate: 3.5,
    targetRecoveryRate: 95.0,
    activeLoansCount: 50,
    totalPortfolio: 41200000,
    dailyGrossExpected: 1850000,
    dailyGrossCollected: 1790000,
    dailyExpenses: 58000,
    par1Rate: 4.2,
    par7Rate: 1.9,
    par30Rate: 0.7,
    status: 'activa'
  }
];

export const INITIAL_CLIENTS: ClientProfile[] = [
  {
    id: 'cli-1',
    name: 'Jaime Alberto Arboleda',
    tradeName: 'Peluquería Barber Don Jaime',
    category: 'Estética / Barbería',
    document: 'CC 71.392.410',
    phone: '+57 311 748 9201',
    address: 'Calle 44 # 108-25',
    neighborhood: 'Comuna 13 - San Javier',
    routeId: 'route-1',
    riskTier: 'A_excelente',
    daysOverdue: 0,
    hasPreventiveBlock: false,
    guarantorName: 'Rosa Elena Ospina (Esposa)',
    guarantorPhone: '+57 312 901 4432',
    lat: 6.2518,
    lng: -75.6142
  },
  {
    id: 'cli-2',
    name: 'Gloria Inés Montoya',
    tradeName: 'Puesto de Frutas & Jugos La Paisita',
    category: 'Ventas Ambulantes / Perecederos',
    document: 'CC 43.189.552',
    phone: '+57 300 281 6649',
    address: 'Cra 110 # 42-10 Esquina',
    neighborhood: 'Comuna 13 - 20 de Julio',
    routeId: 'route-1',
    riskTier: 'B_promedio',
    daysOverdue: 1,
    hasPreventiveBlock: false,
    guarantorName: 'Hernán Montoya (Hermano)',
    guarantorPhone: '+57 319 448 1120',
    lat: 6.2495,
    lng: -75.6189
  },
  {
    id: 'cli-3',
    name: 'Robinson de Jesús Galeano',
    tradeName: 'Taller de Motos y Repuestos El Rayo',
    category: 'Mecánica / Talleres',
    document: 'CC 98.471.229',
    phone: '+57 313 559 8812',
    address: 'Calle 48 # 99-14',
    neighborhood: 'Comuna 13 - El Salado',
    routeId: 'route-1',
    riskTier: 'C_alto_riesgo',
    daysOverdue: 3, // ALERTA CRÍTICA >= 2 DÍAS
    hasPreventiveBlock: true,
    guarantorName: 'Darío Galeano',
    guarantorPhone: '+57 310 994 3321',
    lat: 6.2533,
    lng: -75.6210
  },
  {
    id: 'cli-4',
    name: 'Luz Marina Sepúlveda',
    tradeName: 'Confecciones & Arreglos Luzma',
    category: 'Taller Confección',
    document: 'CC 32.884.103',
    phone: '+57 314 662 3319',
    address: 'Cra 44 # 78-12',
    neighborhood: 'Manrique Central',
    routeId: 'route-2',
    riskTier: 'A_excelente',
    daysOverdue: 0,
    hasPreventiveBlock: false,
    guarantorName: 'Jorge Mario Valencia',
    guarantorPhone: '+57 300 998 1234',
    lat: 6.2731,
    lng: -75.5521
  },
  {
    id: 'cli-5',
    name: 'Wilmar Alexander Piedrahita',
    tradeName: 'Comidas Rápidas El Perro Paisa',
    category: 'Alimentos y Bebidas',
    document: 'CC 1.017.204.912',
    phone: '+57 318 440 2933',
    address: 'Calle 30A # 76-40',
    neighborhood: 'Belén Parque',
    routeId: 'route-3',
    riskTier: 'A_excelente',
    daysOverdue: 0,
    hasPreventiveBlock: false,
    guarantorName: 'Marcela Piedrahita',
    guarantorPhone: '+57 312 400 9011',
    lat: 6.2312,
    lng: -75.5960
  }
];

export const INITIAL_LOANS: LoanDetail[] = [
  {
    id: 'loan-1',
    code: 'PREST-C13-001',
    clientId: 'cli-1',
    clientName: 'Jaime Alberto Arboleda',
    tradeName: 'Peluquería Barber Don Jaime',
    routeId: 'route-1',
    principal: 1000000,
    interestRate: 20.0, // 20% mensual en 24 días hábiles
    totalDebt: 1200000,
    installmentAmount: 50000, // 24 cuotas de $50,000
    termDays: 24,
    installmentsPaid: 16,
    totalCollected: 800000,
    remainingBalance: 400000,
    disbursedDate: '2026-10-06',
    dueDate: '2026-10-31',
    daysOverdue: 0,
    status: 'activo',
    todayPaid: true
  },
  {
    id: 'loan-2',
    code: 'PREST-C13-002',
    clientId: 'cli-2',
    clientName: 'Gloria Inés Montoya',
    tradeName: 'Puesto de Frutas & Jugos La Paisita',
    routeId: 'route-1',
    principal: 600000,
    interestRate: 20.0,
    totalDebt: 720000,
    installmentAmount: 36000, // 20 cuotas de $36,000
    termDays: 20,
    installmentsPaid: 11,
    totalCollected: 396000,
    remainingBalance: 324000,
    disbursedDate: '2026-10-12',
    dueDate: '2026-11-04',
    daysOverdue: 1,
    status: 'activo',
    todayPaid: false
  },
  {
    id: 'loan-3',
    code: 'PREST-C13-003',
    clientId: 'cli-3',
    clientName: 'Robinson de Jesús Galeano',
    tradeName: 'Taller de Motos El Rayo',
    routeId: 'route-1',
    principal: 1500000,
    interestRate: 20.0,
    totalDebt: 1800000,
    installmentAmount: 75000, // 24 cuotas de $75,000
    termDays: 24,
    installmentsPaid: 7,
    totalCollected: 525000,
    remainingBalance: 1275000,
    disbursedDate: '2026-10-02',
    dueDate: '2026-10-29',
    daysOverdue: 3, // Alerta: 3 días sin abonar
    status: 'mora_severa',
    todayPaid: false
  },
  {
    id: 'loan-4',
    code: 'PREST-MAN-012',
    clientId: 'cli-4',
    clientName: 'Luz Marina Sepúlveda',
    tradeName: 'Confecciones & Arreglos Luzma',
    routeId: 'route-2',
    principal: 800000,
    interestRate: 20.0,
    totalDebt: 960000,
    installmentAmount: 40000,
    termDays: 24,
    installmentsPaid: 19,
    totalCollected: 760000,
    remainingBalance: 200000,
    disbursedDate: '2026-10-03',
    dueDate: '2026-10-28',
    daysOverdue: 0,
    status: 'activo',
    todayPaid: true
  },
  {
    id: 'loan-5',
    code: 'PREST-BEL-008',
    clientId: 'cli-5',
    clientName: 'Wilmar Alexander Piedrahita',
    tradeName: 'Comidas Rápidas El Perro Paisa',
    routeId: 'route-3',
    principal: 2000000,
    interestRate: 20.0,
    totalDebt: 2400000,
    installmentAmount: 100000,
    termDays: 24,
    installmentsPaid: 14,
    totalCollected: 1400000,
    remainingBalance: 1000000,
    disbursedDate: '2026-10-08',
    dueDate: '2026-11-02',
    daysOverdue: 0,
    status: 'activo',
    todayPaid: true
  }
];

export const INITIAL_LEDGER: LedgerEntry[] = [
  {
    id: 'led-1',
    receiptNumber: 'REC-20261026-001',
    loanId: 'loan-1',
    clientId: 'cli-1',
    clientName: 'Jaime Alberto Arboleda',
    routeId: 'route-1',
    amount: 50000,
    principalPortion: 41666.67,
    interestPortion: 8333.33,
    paymentMethod: 'efectivo',
    preBalance: 450000,
    postBalance: 400000,
    timestamp: '2026-10-26T08:42:10-05:00',
    gpsLocation: '6.2518 N, -75.6142 W (San Javier)',
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  },
  {
    id: 'led-2',
    receiptNumber: 'REC-20261026-002',
    loanId: 'loan-4',
    clientId: 'cli-4',
    clientName: 'Luz Marina Sepúlveda',
    routeId: 'route-2',
    amount: 40000,
    principalPortion: 33333.33,
    interestPortion: 6666.67,
    paymentMethod: 'nequi',
    preBalance: 240000,
    postBalance: 200000,
    timestamp: '2026-10-26T09:15:33-05:00',
    gpsLocation: '6.2731 N, -75.5521 W (Manrique Central)',
    hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
  },
  {
    id: 'led-3',
    receiptNumber: 'REC-20261026-003',
    loanId: 'loan-5',
    clientId: 'cli-5',
    clientName: 'Wilmar Alexander Piedrahita',
    routeId: 'route-3',
    amount: 100000,
    principalPortion: 83333.33,
    interestPortion: 16666.67,
    paymentMethod: 'efectivo',
    preBalance: 1100000,
    postBalance: 1000000,
    timestamp: '2026-10-26T10:02:44-05:00',
    gpsLocation: '6.2312 N, -75.5960 W (Belén Parque)',
    hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'
  }
];

export const INITIAL_EXPENSES: RouteExpenseItem[] = [
  {
    id: 'exp-1',
    routeId: 'route-1',
    category: 'combustible_moto',
    amount: 22000,
    description: 'Tanqueo gasolina corriente Moto Pulsar 180 (Bomba Terpel San Juan)',
    timestamp: '2026-10-26T07:30:00-05:00',
    isApproved: true
  },
  {
    id: 'exp-2',
    routeId: 'route-1',
    category: 'alimentacion_viaticos',
    amount: 16000,
    description: 'Almuerzo corriente ejecutivo en ruta (Comuna 13)',
    timestamp: '2026-10-26T12:45:00-05:00',
    isApproved: true
  },
  {
    id: 'exp-3',
    routeId: 'route-1',
    category: 'telefonia_datos',
    amount: 10000,
    description: 'Recarga paquete datos Claro 10GB para sincronización GPS',
    timestamp: '2026-10-26T07:15:00-05:00',
    isApproved: true
  },
  {
    id: 'exp-4',
    routeId: 'route-2',
    category: 'combustible_moto',
    amount: 25000,
    description: 'Tanqueo gasolina Moto Boxer CT100 (Estación Manrique)',
    timestamp: '2026-10-26T07:40:00-05:00',
    isApproved: true
  },
  {
    id: 'exp-5',
    routeId: 'route-2',
    category: 'mantenimiento_moto',
    amount: 15000,
    description: 'Despinchada y parche llanta trasera en taller Manrique',
    timestamp: '2026-10-26T11:20:00-05:00',
    isApproved: true
  }
];
