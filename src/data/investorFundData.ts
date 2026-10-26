/**
 * MODELO FINANCIERO DE MÚLTIPLES INVERSIONISTAS & LÍNEAS ESCALONADAS
 */

export interface InvestorPartner {
  id: string;
  name: string;
  type: 'socio_fundador' | 'inversionista_angel' | 'fondo_familiar';
  capitalContributed: number; // Aporte en capital (COP)
  equitySharePercent: number; // % participación sobre el fondo
  grossYieldEarned: number; // Intereses brutos devengados
  allocatedOpexCost: number; // Cuota proporcional de gastos de ruta
  allocatedLossProvision: number; // Cuota de provisión por morosidad
  netDividendsPayable: number; // Utilidad neta disponible
  historicRoiPercent: number; // Retorno de inversión %
  joinedDate: string;
}

export interface CreditTierLevel {
  levelNumber: number;
  name: string;
  badgeColor: string;
  minConsecutiveCleanCredits: number; // Créditos pagados sin mora requeridos
  creditLimit: number; // Cupo máximo de desembolso
  rateDiscountPercent: number; // Descuento sobre tasa estándar
  maxTermDays: number;
  perks: string[];
}

export const INITIAL_INVESTORS: InvestorPartner[] = [
  {
    id: 'inv-1',
    name: 'Carlos Echeverri & Cía.',
    type: 'socio_fundador',
    capitalContributed: 45000000,
    equitySharePercent: 45.0,
    grossYieldEarned: 9000000,
    allocatedOpexCost: 1080000,
    allocatedLossProvision: 360000,
    netDividendsPayable: 7560000,
    historicRoiPercent: 16.8,
    joinedDate: '2025-01-10'
  },
  {
    id: 'inv-2',
    name: 'Grupo Inversiones El Poblado',
    type: 'fondo_familiar',
    capitalContributed: 30000000,
    equitySharePercent: 30.0,
    grossYieldEarned: 6000000,
    allocatedOpexCost: 720000,
    allocatedLossProvision: 240000,
    netDividendsPayable: 5040000,
    historicRoiPercent: 16.8,
    joinedDate: '2025-03-15'
  },
  {
    id: 'inv-3',
    name: 'Inversiones Llanogrande Capital',
    type: 'inversionista_angel',
    capitalContributed: 15000000,
    equitySharePercent: 15.0,
    grossYieldEarned: 3000000,
    allocatedOpexCost: 360000,
    allocatedLossProvision: 120000,
    netDividendsPayable: 2520000,
    historicRoiPercent: 16.8,
    joinedDate: '2025-06-01'
  },
  {
    id: 'inv-4',
    name: 'Fondo Antioquia Semilla',
    type: 'inversionista_angel',
    capitalContributed: 10000000,
    equitySharePercent: 10.0,
    grossYieldEarned: 2000000,
    allocatedOpexCost: 240000,
    allocatedLossProvision: 80000,
    netDividendsPayable: 1680000,
    historicRoiPercent: 16.8,
    joinedDate: '2025-08-20'
  }
];

export const CREDIT_TIERS: CreditTierLevel[] = [
  {
    levelNumber: 1,
    name: 'Nivel Semilla',
    badgeColor: 'text-slate-300 border-slate-600 bg-slate-800/60',
    minConsecutiveCleanCredits: 0,
    creditLimit: 400000,
    rateDiscountPercent: 0,
    maxTermDays: 20,
    perks: ['Desembolso básico', 'Cobro diario obligatorio en local', 'Exige fiador solidario']
  },
  {
    levelNumber: 2,
    name: 'Nivel Crecimiento',
    badgeColor: 'text-blue-300 border-blue-500/40 bg-blue-950/30',
    minConsecutiveCleanCredits: 1,
    creditLimit: 800000,
    rateDiscountPercent: 1.0,
    maxTermDays: 24,
    perks: ['Cupo duplicado a $800k', 'Habilitación de pago con QR Nequi/Daviplata', 'Plazo a 24 días']
  },
  {
    levelNumber: 3,
    name: 'Nivel Comercio Consolidado',
    badgeColor: 'text-amber-300 border-amber-500/40 bg-amber-950/30',
    minConsecutiveCleanCredits: 2,
    creditLimit: 1500000,
    rateDiscountPercent: 2.5,
    maxTermDays: 30,
    perks: ['Cupo hasta $1.5M', 'Plazo flexible de 30 días', 'Desembolso instantáneo a Nequi']
  },
  {
    levelNumber: 4,
    name: 'Nivel Aliado Preferente (AAA)',
    badgeColor: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/30',
    minConsecutiveCleanCredits: 3,
    creditLimit: 3000000,
    rateDiscountPercent: 4.0,
    maxTermDays: 45,
    perks: ['Cupo preferencial hasta $3.0M COP', 'Sin fiador obligatorio', 'Tasa reducida al 16% flat', 'Línea rotativa en Wallet']
  }
];
