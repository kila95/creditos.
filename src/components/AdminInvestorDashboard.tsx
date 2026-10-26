import React, { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  MapPin,
  Activity,
  Fuel,
  Calculator,
  Lock,
  BrainCircuit,
  ArrowRightLeft,
  FileCheck,
  Bot,
  UserPlus,
  Users,
  Settings,
  Layers,
  Database,
  Crown,
  Search,
  Phone,
} from 'lucide-react';
import {
  RouteData,
  ClientProfile,
  LoanDetail,
  RouteExpenseItem,
  LedgerEntry,
  CollectorBase,
} from '../data/mockData';
import {
  formatCOP,
  calculateNetCashFlow,
  calculateRouteBreakEven,
  simulateMicroloan,
} from '../utils/financialCalculations';
import { detectRouteAnomalies } from '../utils/scoringEngine';
import { RiskIntelligenceModal } from './RiskIntelligenceModal';
import { DynamicRouteAssignment } from './DynamicRouteAssignment';
import { DailyCashReconciliationModal } from './DailyCashReconciliationModal';
import { AiNegotiationAssistantModal } from './AiNegotiationAssistantModal';
import { CollectorWeeklyBaseManager } from './CollectorWeeklyBaseManager';
import { AdminCollectorUsersManager, CollectorUserRecord } from './AdminCollectorUsersManager';
import { SuperAdminTenantsManager } from './SuperAdminTenantsManager';
import { NegotiationProposal } from '../utils/aiNegotiator';
import { useAuth } from '../context/AuthContext';

interface AdminDashboardProps {
  routes: RouteData[];
  clients: ClientProfile[];
  loans: LoanDetail[];
  expenses: RouteExpenseItem[];
  ledger: LedgerEntry[];
  collectorBases?: CollectorBase[];
  onAssignCollectorBase?: (newBase: CollectorBase) => Promise<void> | void;
  onUpdateCollectorBaseStatus?: (baseId: string, status: 'ACTIVA' | 'DEVUELTA') => Promise<void> | void;
  onCollectorCreated?: (collector: CollectorUserRecord) => void;
  onRestructureLoan: (loanId: string) => void;
  onToggleClientBlock: (clientId: string) => void;
  onReassignClientRoute: (clientId: string, newRouteId: string) => void;
  onConfirmReconciliation: (routeId: string, actualCash: number, discrepancy: number, notes: string) => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenNewClientModal?: () => void;
}

type AdminSectionTab =
  | 'all_sections'
  | 'gestion_cuentas'
  | 'monitoreo_rutas'
  | 'auditoria_riesgo'
  | 'configuracion_sistema';

export const AdminInvestorDashboard: React.FC<AdminDashboardProps> = ({
  routes,
  clients,
  loans,
  expenses,
  ledger,
  collectorBases = [],
  onAssignCollectorBase,
  onUpdateCollectorBaseStatus,
  onCollectorCreated,
  onRestructureLoan,
  onToggleClientBlock,
  onReassignClientRoute,
  onConfirmReconciliation,
  onNavigateToTab,
  onOpenNewClientModal,
}) => {
  const { profile, role, isSuperAdmin } = useAuth();

  // Navegación interna por pestañas organizadas del Super Admin / Admin
  const [activeSection, setActiveSection] = useState<AdminSectionTab>('all_sections');

  // Modales avanzados
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showAiNegotiatorModal, setShowAiNegotiatorModal] = useState(false);
  const [reconcilingRoute, setReconcilingRoute] = useState<RouteData | null>(null);

  // Estado para el simulador de crédito del CFO
  const [simPrincipal, setSimPrincipal] = useState<number>(1000000);
  const [simRate, setSimRate] = useState<number>(20);
  const [simTerm, setSimTerm] = useState<number>(24);
  const [simDefaultRate, setSimDefaultRate] = useState<number>(8);
  const [adminClientSearch, setAdminClientSearch] = useState<string>('');

  // Detección de anomalías en vivo
  const anomalies = detectRouteAnomalies(routes, loans, expenses);

  // Cálculos consolidados globales
  const totalPortfolio = loans.reduce(
    (acc, l) => acc + (l.status === 'activo' || l.status === 'mora_severa' ? l.remainingBalance : 0),
    0
  );
  const totalGrossCollected = routes.reduce((acc, r) => acc + r.dailyGrossCollected, 0);
  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);

  // Provisión obligatoria del 4% sobre recaudo bruto para cartera incobrable
  const { badDebtProvision, netCashFlow, netMarginPercent } = calculateNetCashFlow(
    totalGrossCollected,
    totalExpenses,
    4.0
  );

  // Clientes con 2 o más días de mora (Regla de Riesgo Obligatoria)
  const highRiskOverdueLoans = loans.filter((l) => l.daysOverdue >= 2 && l.status !== 'liquidado');

  // Ejecución de simulación
  const simResult = simulateMicroloan(simPrincipal, simRate, simTerm, simDefaultRate);

  const handleApproveAiAgreement = (proposal: NegotiationProposal) => {
    const matchedLoan = loans.find((l) => l.clientName === proposal.clientName);
    if (matchedLoan) {
      onRestructureLoan(matchedLoan.id);
    }
    setShowAiNegotiatorModal(false);
  };

  return (
    <div className="space-y-6">
      {/* =====================================================================
          1. CABECERA EJECUTIVA + TARJETAS DE MÉTRICAS (SAAS MODERNO)
         ===================================================================== */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{isSuperAdmin ? 'Administración Global Multi-Fondo' : 'Panel de Administración de Fondo'}</span>
              <span aria-hidden="true">·</span>
              <span>{profile?.organizationName || 'RutaCapital Medellín'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-300">{role}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
              {isSuperAdmin
                ? 'Centro de Control Super Administrador & Liquidez'
                : 'Consolidado de Caja, Rutas y Equipo de Cobro'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Flujo de Caja Neto = Recaudo Bruto Diario − Gastos Operativos de Ruta − Provisión de Cartera (4%)
            </p>
          </div>

          {/* Botones de Acción Rápida */}
          <div className="flex flex-wrap items-center gap-2">
            {onOpenNewClientModal && (
              <button
                type="button"
                onClick={onOpenNewClientModal}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Nuevo Cliente / Crédito</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowRiskModal(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BrainCircuit className="w-4 h-4 text-emerald-400" />
              <span>Scoring de Riesgo</span>
            </button>

            <button
              type="button"
              onClick={() => setShowReassignModal(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4 text-teal-400" />
              <span>Reasignar Rutas</span>
            </button>
          </div>
        </div>

        {/* Grid de 4 Tarjetas de Métricas Clave (SaaS Cards con tabular-nums) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
          {/* Card 1 */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Recaudo Bruto Diario</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1.5 font-mono tabular-nums">
              {formatCOP(totalGrossCollected)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span>{loans.filter((l) => l.todayPaid).length} abonos hoy</span>
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              <span>{routes.length} rutas activas</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Gastos Operativos (OpEx)</span>
              <Fuel className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-amber-300 mt-1.5 font-mono tabular-nums">
              {formatCOP(totalExpenses)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Combustible, mantenimiento y viáticos
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Provisión Cartera (4%)</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xl font-bold text-rose-300 mt-1.5 font-mono tabular-nums">
              {formatCOP(badDebtProvision)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Reserva obligatoria de riesgo
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between text-emerald-300 text-xs font-medium">
              <span>Flujo de Caja Neto</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-400 mt-1.5 font-mono tabular-nums">
              {formatCOP(netCashFlow)}
            </div>
            <div className="text-xs text-slate-300 mt-1 tabular-nums">
              Margen operativo neto: <strong className="text-white">{netMarginPercent.toFixed(1)}%</strong>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          2. NAVEGACIÓN INTERNA POR APARTADOS ORGANIZADOS (TABS RESPONSIVE)
         ===================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSection('all_sections')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeSection === 'all_sections'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Vista General</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('gestion_cuentas')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeSection === 'gestion_cuentas'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          {isSuperAdmin ? <Crown className="w-3.5 h-3.5 text-amber-300" /> : <Users className="w-3.5 h-3.5" />}
          <span>{isSuperAdmin ? '1. Gestión de Administradores & Cobradores' : '1. Gestión de Cobradores & Bases'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('monitoreo_rutas')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeSection === 'monitoreo_rutas'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>2. Monitoreo de Rutas & Arqueos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('auditoria_riesgo')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeSection === 'auditoria_riesgo'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>3. Auditoría General & Mora ({highRiskOverdueLoans.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('configuracion_sistema')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeSection === 'configuracion_sistema'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>4. Configuración & Simulador Financiero</span>
        </button>
      </div>

      {/* =====================================================================
          APARTADO 1: GESTIÓN DE ADMINISTRADORES, COBRADORES Y BASES SEMANALES
         ===================================================================== */}
      {(activeSection === 'all_sections' || activeSection === 'gestion_cuentas') && (
        <div className="space-y-6">
          {/* Nivel 1 (Exclusivo Super Admin): Creación de Administradores */}
          <SuperAdminTenantsManager />

          {/* Nivel 2 (Admin y Super Admin): Creación de Cobradores y Asignación de Rutas */}
          <AdminCollectorUsersManager
            routes={routes}
            onCollectorCreated={onCollectorCreated}
            onSwitchToCollectorView={() => onNavigateToTab && onNavigateToTab('collector_street')}
          />

          {/* Gestión de Bases Semanales de Efectivo para Cobradores */}
          {onAssignCollectorBase && onUpdateCollectorBaseStatus && (
            <CollectorWeeklyBaseManager
              routes={routes}
              collectorBases={collectorBases}
              onAssignBase={onAssignCollectorBase}
              onUpdateBaseStatus={onUpdateCollectorBaseStatus}
            />
          )}
        </div>
      )}

      {/* =====================================================================
          APARTADO 2: MONITOREO DE RUTAS, PUNTO DE EQUILIBRIO Y ARQUEO DE CAJA
         ===================================================================== */}
      {(activeSection === 'all_sections' || activeSection === 'monitoreo_rutas') && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Monitoreo de Rutas y Punto de Equilibrio Operativo
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Cobertura de gastos fijos diarios (combustible, moto y viáticos) y estado de recaudo por sector
              </p>
            </div>
            <div className="text-xs font-mono text-slate-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 tabular-nums">
              Cartera Activa Total: <strong className="text-white">{formatCOP(totalPortfolio)}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {routes.map((route) => {
              const breakEven = calculateRouteBreakEven(route.fixedDailyOpex, 850000, 20, 24);
              const coverageRatio = route.activeLoansCount / breakEven.breakEvenActiveLoans;
              const isHealthy = coverageRatio >= 1.5;

              return (
                <div
                  key={route.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{route.name}</span>
                        <span className="text-xs font-mono text-slate-400">({route.code})</span>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Rutero: {route.collectorName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{route.zone}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setReconcilingRoute(route)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Arqueo de Caja</span>
                    </button>
                  </div>

                  {/* Métricas de la Ruta */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">Recaudo Hoy</span>
                      <span className="text-sm font-bold text-emerald-400 font-mono tabular-nums">
                        {formatCOP(route.dailyGrossCollected)}
                      </span>
                    </div>

                    <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">OpEx Fijo/Día</span>
                      <span className="text-sm font-bold text-amber-300 font-mono tabular-nums">
                        {formatCOP(route.fixedDailyOpex)}
                      </span>
                    </div>

                    <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">Créditos Activos</span>
                      <span className="text-sm font-bold text-white font-mono tabular-nums">
                        {route.activeLoansCount} / {breakEven.breakEvenActiveLoans} mín
                      </span>
                    </div>

                    <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">Mora PAR-1 / 30</span>
                      <span className="text-sm font-bold text-slate-200 font-mono tabular-nums">
                        {route.par1Rate}% / <span className="text-rose-400">{route.par30Rate}%</span>
                      </span>
                    </div>
                  </div>

                  {/* Barra de Cobertura */}
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Cobertura de Punto de Equilibrio ({coverageRatio.toFixed(1)}x)</span>
                      <span className={isHealthy ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                        {isHealthy ? 'Rentabilidad Óptima' : 'En Umbral de Costos'}
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{
                          width: `${Math.min(100, (route.activeLoansCount / (breakEven.breakEvenActiveLoans * 2)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* =====================================================================
          APARTADO 3: AUDITORÍA GENERAL, ALERTAS DE RIESGO Y MORA >= 2 DÍAS
         ===================================================================== */}
      {(activeSection === 'all_sections' || activeSection === 'auditoria_riesgo') && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Auditoría de Cartera y Alertas Tempranas (Mora ≥ 2 Días)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Control de bloqueo preventivo de nuevos desembolsos y reestructuración asistida de deuda
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAiNegotiatorModal(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
                <span>Asistente de Reestructuración</span>
              </button>
              {onNavigateToTab && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab('audit_logs')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ver Bitácora SHA-256</span>
                </button>
              )}
            </div>
          </div>

          {anomalies.length > 0 && (
            <div className="bg-rose-950/30 border border-rose-800/50 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs">
                <span className="font-bold text-white block">
                  {anomalies.length} Anomalía(s) Operativa(s) Detectada(s)
                </span>
                <span className="text-rose-300">{anomalies[0].message}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRiskModal(true)}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
              >
                Auditar Anomalías
              </button>
            </div>
          )}

          {/* Buscador Instantáneo por Nombre o Teléfono en Panel de Administración */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={adminClientSearch}
                onChange={(e) => setAdminClientSearch(e.target.value)}
                placeholder="Buscador instantáneo de cartera por nombre, teléfono celular o comercio..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div className="text-[11px] text-slate-400 font-mono shrink-0">
              Total préstamos activos: <strong className="text-white">{loans.length}</strong>
            </div>
          </div>

          {adminClientSearch.trim() !== '' && (
            <div className="overflow-x-auto bg-slate-950/50 border border-slate-800 rounded-xl p-3">
              <div className="text-[11px] font-semibold text-emerald-400 mb-2">
                Resultados de búsqueda instantánea ("{adminClientSearch}"):
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Cliente / Comercio</th>
                    <th className="py-2 px-3">Teléfono</th>
                    <th className="py-2 px-3">Ruta</th>
                    <th className="py-2 px-3 text-right">Saldo Pendiente (COP)</th>
                    <th className="py-2 px-3 text-right">Cuota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loans
                    .filter((loan) => {
                      const client = clients.find((c) => c.id === loan.clientId);
                      const q = adminClientSearch.trim().toLowerCase();
                      const qDigits = q.replace(/\D/g, '');
                      const phoneRaw = client?.phone || '';
                      const phoneDigits = phoneRaw.replace(/\D/g, '');
                      return (
                        loan.clientName.toLowerCase().includes(q) ||
                        loan.tradeName.toLowerCase().includes(q) ||
                        phoneRaw.toLowerCase().includes(q) ||
                        (qDigits.length > 0 && phoneDigits.includes(qDigits))
                      );
                    })
                    .map((loan) => {
                      const client = clients.find((c) => c.id === loan.clientId);
                      return (
                        <tr key={loan.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-white">{loan.clientName}</div>
                            <div className="text-[11px] text-slate-400">{loan.tradeName}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-300 text-[11px]">
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {client?.phone || 'Sin teléfono'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-300 text-[11px]">{loan.routeId}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-white tabular-nums">
                            {formatCOP(loan.remainingBalance)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300 tabular-nums">
                            {formatCOP(loan.installmentAmount)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {highRiskOverdueLoans.length === 0 ? (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-6 text-center">
              <p className="text-xs text-slate-300 font-medium">
                Sin préstamos con mora crítica igual o superior a 2 días en este momento.
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Todos los clientes registrados en las rutas activas se encuentran al día.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Cliente / Comercio</th>
                    <th className="py-2.5 px-3">Ruta</th>
                    <th className="py-2.5 px-3">Atraso</th>
                    <th className="py-2.5 px-3 text-right">Saldo Pendiente</th>
                    <th className="py-2.5 px-3 text-right">Cuota Diaria</th>
                    <th className="py-2.5 px-3">Estado de Bloqueo</th>
                    <th className="py-2.5 px-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {highRiskOverdueLoans.map((loan) => {
                    const client = clients.find((c) => c.id === loan.clientId);
                    const isBlocked = client?.hasPreventiveBlock ?? true;

                    return (
                      <tr key={loan.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white">{loan.clientName}</div>
                          <div className="text-[11px] text-slate-400">{loan.tradeName}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-300 font-mono text-[11px]">
                          {loan.routeId}
                        </td>
                        <td className="py-3 px-3 text-rose-300 font-medium tabular-nums">
                          {loan.daysOverdue} días
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-rose-200 tabular-nums">
                          {formatCOP(loan.remainingBalance)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300 tabular-nums">
                          {formatCOP(loan.installmentAmount)}
                        </td>
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => onToggleClientBlock(loan.clientId)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                              isBlocked
                                ? 'bg-rose-950/80 text-rose-200 border border-rose-700/60'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            <Lock className="w-3 h-3" />
                            {isBlocked ? 'Bloqueado' : 'Desbloqueado'}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => setShowAiNegotiatorModal(true)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            Reestructurar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          APARTADO 4: CONFIGURACIÓN DEL SISTEMA & SIMULADOR FINANCIERO
         ===================================================================== */}
      {(activeSection === 'all_sections' || activeSection === 'configuracion_sistema') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Simulador Financiero & TEA Implícita */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                <Calculator className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Simulador Financiero de Microcréditos & TEA Implícita
                </h3>
                <p className="text-xs text-slate-400">
                  Calibración de cuotas diarias, amortización y reserva de liquidez
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-xs">
              <div className="space-y-3.5">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Capital a Desembolsar: <strong className="text-white font-mono tabular-nums">{formatCOP(simPrincipal)}</strong>
                  </label>
                  <input
                    type="range"
                    min={200000}
                    max={3000000}
                    step={100000}
                    value={simPrincipal}
                    onChange={(e) => setSimPrincipal(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">Tasa Flat</label>
                    <select
                      value={simRate}
                      onChange={(e) => setSimRate(Number(e.target.value))}
                      className="w-full bg-slate-950 text-slate-200 rounded-lg p-2 border border-slate-800"
                    >
                      <option value={15}>15% Flat</option>
                      <option value={20}>20% Flat</option>
                      <option value={25}>25% Flat</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium block mb-1">Plazo</label>
                    <select
                      value={simTerm}
                      onChange={(e) => setSimTerm(Number(e.target.value))}
                      className="w-full bg-slate-950 text-slate-200 rounded-lg p-2 border border-slate-800"
                    >
                      <option value={20}>20 Días</option>
                      <option value={24}>24 Días</option>
                      <option value={30}>30 Días</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Morosidad Proyectada: <strong className="text-rose-300 font-mono tabular-nums">{simDefaultRate}%</strong>
                  </label>
                  <input
                    type="range"
                    min={3}
                    max={20}
                    step={1}
                    value={simDefaultRate}
                    onChange={(e) => setSimDefaultRate(Number(e.target.value))}
                    className="w-full accent-rose-500"
                  />
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Cuota Diaria Fija:</span>
                  <span className="font-bold text-white text-base font-mono tabular-nums">
                    {formatCOP(simResult.dailyInstallment)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Amortización Capital:</span>
                  <span className="font-mono text-slate-300 tabular-nums">
                    {formatCOP(simResult.dailyPrincipalPortion)}/día
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Interés Devengado:</span>
                  <span className="font-mono text-emerald-400 tabular-nums">
                    {formatCOP(simResult.dailyInterestPortion)}/día
                  </span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                  <span className="text-slate-300">Total a Recaudar:</span>
                  <span className="font-bold text-emerald-300 font-mono tabular-nums">
                    {formatCOP(simResult.totalDebt)}
                  </span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                  <span className="text-slate-400">Colchón de Liquidez:</span>
                  <span className="font-bold text-rose-300 font-mono tabular-nums">
                    {formatCOP(simResult.liquidityBufferRequired)}
                  </span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                  <span className="text-slate-400">TEA Implícita:</span>
                  <span className="font-bold text-amber-300 font-mono tabular-nums">
                    {simResult.implicitTEA.toFixed(0)}% E.A.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Parámetros de Seguridad y Configuración Multi-Tenant */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Configuración del Sistema & Seguridad RLS
                  </h3>
                  <p className="text-xs text-slate-400">
                    Parámetros activos de aislamiento jerárquico de 3 niveles
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-2 border-b border-slate-800/70">
                  <span className="text-slate-400">Rol de Sesión Actual</span>
                  <span className="font-mono font-semibold text-emerald-400">{role}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-800/70">
                  <span className="text-slate-400">Organización Vinculada</span>
                  <span className="font-mono text-white">{profile?.organizationId || 'org-medellin-01'}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-800/70">
                  <span className="text-slate-400">Provisión Cartera Incobrable</span>
                  <span className="font-mono text-white tabular-nums">4.0% Fijo</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-800/70">
                  <span className="text-slate-400">Política de Inicio de Sesión</span>
                  <span className="font-mono text-amber-300">Login Obligatorio</span>
                </div>
              </div>
            </div>

            {onNavigateToTab && (
              <button
                type="button"
                onClick={() => onNavigateToTab('supabase_sql')}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Inspeccionar Script SQL & Políticas RLS</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* MODALES OPERATIVOS */}
      {showRiskModal && (
        <RiskIntelligenceModal
          clients={clients}
          loans={loans}
          routes={routes}
          ledger={ledger}
          onClose={() => setShowRiskModal(false)}
        />
      )}

      {showReassignModal && (
        <DynamicRouteAssignment
          routes={routes}
          clients={clients}
          loans={loans}
          onReassignClientRoute={onReassignClientRoute}
          onClose={() => setShowReassignModal(false)}
        />
      )}

      {showAiNegotiatorModal && (
        <AiNegotiationAssistantModal
          clients={clients}
          loans={loans}
          onApproveAgreement={handleApproveAiAgreement}
          onClose={() => setShowAiNegotiatorModal(false)}
        />
      )}

      {reconcilingRoute && (
        <DailyCashReconciliationModal
          route={reconcilingRoute}
          expenses={expenses}
          onConfirmReconciliation={(routeId, actualCash, discrepancy, notes) => {
            onConfirmReconciliation(routeId, actualCash, discrepancy, notes);
            setReconcilingRoute(null);
          }}
          onClose={() => setReconcilingRoute(null)}
        />
      )}
    </div>
  );
};
