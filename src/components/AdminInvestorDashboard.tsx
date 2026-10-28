import React, { useState, useEffect } from 'react';
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
  LayoutDashboard,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Receipt,
  CreditCard
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
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
  roundCOP,
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
import { supabase } from '../lib/supabase';
import { LiquidatedHistoryView } from './LiquidatedHistoryView';
import { SubscriptionPaywall } from './SubscriptionPaywall';
import { HistorialPagos } from './HistorialPagos';
import { GestionarSuscripcionView } from './GestionarSuscripcionView';
import { GpsAuditTrackerModule } from './GpsAuditTrackerModule';

interface AdminDashboardProps {
  routes: RouteData[];
  clients: ClientProfile[];
  loans: LoanDetail[];
  expenses: RouteExpenseItem[];
  ledger: LedgerEntry[];
  collectorBases?: CollectorBase[];
  isSubscriptionActive?: boolean;
  onAssignCollectorBase?: (newBase: CollectorBase) => Promise<void> | void;
  onUpdateCollectorBaseStatus?: (baseId: string, status: 'ACTIVA' | 'DEVUELTA') => Promise<void> | void;
  onCollectorCreated?: (collector: CollectorUserRecord) => void;
  onRestructureLoan: (loanId: string) => void;
  onToggleClientBlock: (clientId: string) => void;
  onReassignClientRoute: (clientId: string, newRouteId: string) => void;
  onConfirmReconciliation: (routeId: string, actualCash: number, discrepancy: number, notes: string, sessionRecord?: any) => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenNewClientModal?: () => void;
}

type AdminTab =
  | 'dashboard'
  | 'gestion_cobradores'
  | 'lista_clientes'
  | 'liquidated_history'
  | 'liquidados_historico'
  | 'scoring_riesgo'
  | 'cierre_caja'
  | 'simulador_cfo'
  | 'auditoria'
  | 'auditoria_gps'
  | 'historial_pagos'
  | 'suscripcion';

export const AdminInvestorDashboard: React.FC<AdminDashboardProps> = ({
  routes,
  clients,
  loans,
  expenses,
  ledger,
  collectorBases = [],
  isSubscriptionActive: isSubscriptionActiveProp,
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
  const { user, profile, role, isSuperAdmin } = useAuth();
  const tenantId = profile?.organizationId || user?.id || 'org-medellin-01';

  // Navegación interna por pestañas en el Panel de Control Sidebar (con soporte para /admin/suscripcion)
  const [activeTab, setActiveTab] = useState<AdminTab>(() =>
    typeof window !== 'undefined' && window.location.pathname === '/admin/suscripcion'
      ? 'suscripcion'
      : 'dashboard'
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [isSubscriptionActive, setIsSubscriptionActive] = useState<boolean>(
    isSubscriptionActiveProp ?? true
  );

  const navigateAdminTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      const targetPath = tab === 'suscripcion' ? '/admin/suscripcion' : '/admin';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    }
  };

  useEffect(() => {
    if (typeof isSubscriptionActiveProp === 'boolean') {
      setIsSubscriptionActive(isSubscriptionActiveProp);
      return;
    }
    if (isSuperAdmin) {
      setIsSubscriptionActive(true);
      return;
    }

    let mounted = true;
    supabase
      .from('tenant_subscriptions')
      .select('status, trial_end')
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted && data && data.status) {
          const isTrialValid =
            data.status === 'trialing' &&
            Boolean(data.trial_end && new Date(data.trial_end).getTime() > Date.now());
          setIsSubscriptionActive(data.status === 'active' || isTrialValid);
        }
      });

    return () => {
      mounted = false;
    };
  }, [tenantId, isSubscriptionActiveProp, isSuperAdmin]);

  // Modales avanzados
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showAiNegotiatorModal, setShowAiNegotiatorModal] = useState(false);
  const [reconcilingRoute, setReconcilingRoute] = useState<RouteData | null>(null);

  // Estado para el simulador de crédito del CFO y buscador de clientes
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

  // Clientes con 2 o más días de mora
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

  // =========================================================================
  // VISTA RESTRINGIDA EXCLUSIVA PARA SUPER_ADMIN (PROVEEDOR SAAS)
  // =========================================================================
  if (isSuperAdmin) {
    const tenantBillingMap = routes.reduce<
      Record<
        string,
        {
          tenantId: string;
          tenantName: string;
          activeRoutesCount: number;
          totalRoutesCount: number;
          zones: string[];
        }
      >
    >((acc, route) => {
      const tId = route.organizationId || 'org-medellin-01';
      if (!acc[tId]) {
        acc[tId] = {
          tenantId: tId,
          tenantName:
            tId === 'org-medellin-01'
              ? 'Fondo RutaCapital Sur (Inquilino #1)'
              : tId === 'org-norte-02'
                ? 'Inversiones del Norte (Inquilino #2)'
                : `Organización ${tId}`,
          activeRoutesCount: 0,
          totalRoutesCount: 0,
          zones: [],
        };
      }
      acc[tId].totalRoutesCount += 1;
      if (route.status === 'activa') {
        acc[tId].activeRoutesCount += 1;
      }
      if (route.zone && !acc[tId].zones.includes(route.zone)) {
        acc[tId].zones.push(route.zone);
      }
      return acc;
    }, {});

    if (!tenantBillingMap['org-medellin-01']) {
      tenantBillingMap['org-medellin-01'] = {
        tenantId: 'org-medellin-01',
        tenantName: 'Fondo RutaCapital Sur (Inquilino #1)',
        activeRoutesCount: 1,
        totalRoutesCount: 1,
        zones: ['Comuna 13 - San Javier'],
      };
    }
    if (!tenantBillingMap['org-norte-02']) {
      tenantBillingMap['org-norte-02'] = {
        tenantId: 'org-norte-02',
        tenantName: 'Inversiones del Norte (Inquilino #2)',
        activeRoutesCount: 1,
        totalRoutesCount: 1,
        zones: ['Manrique & Aranjuez'],
      };
    }

    const tenantBillingRows = Object.values(tenantBillingMap);
    const totalActiveRoutesForBilling = tenantBillingRows.reduce((sum, t) => sum + t.activeRoutesCount, 0);
    const feePerActiveRouteCOP = 180000;
    const totalMonthlySaasBillingCOP = totalActiveRoutesForBilling * feePerActiveRouteCOP;

    return (
      <div className="space-y-6">
        <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500 text-slate-950 uppercase tracking-wider">
                  Modo Proveedor SaaS · Solo Lectura Operativa
                </span>
                <span className="text-xs font-mono text-amber-300">
                  role = &apos;super_admin&apos; · Zero-Trust RLS Activo
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white mt-1.5">
                Bloqueo Financiero Confidencial Activo (Aislamiento Multi-Tenant)
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-3xl">
                Por política de privacidad criptográfica y Row Level Security (<code className="text-amber-300 font-mono">NOT public.is_super_admin()</code>), este rol tiene <strong>ESTRICTAMENTE PROHIBIDO</strong> ejecutar inserciones, actualizaciones o consultas sobre saldos financieros confidenciales. La vista se limita a facturación SaaS y aprovisionamiento de inquilinos.
              </p>
            </div>
          </div>

          {onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('supabase_sql')}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 cursor-pointer transition-colors"
            >
              <Database className="w-4 h-4" />
              <span>Ver Políticas SQL &amp; RLS</span>
            </button>
          )}
        </div>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                Métricas Operativas para Facturación del Servicio SaaS (Vista: v_saas_tenant_billing_metrics)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Lectura agregada de rutas activas por organización sin acceso a saldos de cartera
              </p>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-3 py-1 rounded-lg">
              SELECT COUNT(routes) GROUP BY organization_id
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Inquilinos (Tenants) Activos</span>
                <Users className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-bold text-white mt-1.5 font-mono tabular-nums">
                {tenantBillingRows.length}
              </div>
              <div className="text-xs text-slate-400 mt-1">Organizaciones aisladas por tenant_id</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Rutas Activas Facturables</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-400 mt-1.5 font-mono tabular-nums">
                {totalActiveRoutesForBilling}
              </div>
              <div className="text-xs text-slate-400 mt-1">Tarifa: {formatCOP(feePerActiveRouteCOP)} / ruta</div>
            </div>

            <div className="bg-slate-950/70 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between text-amber-300 text-xs font-medium">
                <span>Facturación Mensual SaaS (MRR)</span>
                <DollarSign className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-amber-300 mt-1.5 font-mono tabular-nums">
                {formatCOP(totalMonthlySaasBillingCOP)}
              </div>
              <div className="text-xs text-slate-400 mt-1">Cálculo exclusivo sobre rutas operativas</div>
            </div>

            <div className="bg-slate-950/70 border border-rose-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between text-rose-300 text-xs font-medium">
                <span>Acceso a Tablas Financieras</span>
                <Lock className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-base font-bold text-rose-400 mt-2 font-mono">0 FILAS (BLOQUEADO)</div>
              <div className="text-[11px] text-slate-400 mt-1">clients · loans · payments · sessions</div>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="py-3 px-4">Tenant ID</th>
                  <th className="py-3 px-4">Organización / Inquilino</th>
                  <th className="py-3 px-4">Rutas Activas</th>
                  <th className="py-3 px-4">Tarifa por Ruta</th>
                  <th className="py-3 px-4">Facturación SaaS Mensual</th>
                  <th className="py-3 px-4">Datos Financieros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-900/60">
                {tenantBillingRows.map((row) => (
                  <tr key={row.tenantId} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-bold text-amber-300">{row.tenantId}</td>
                    <td className="py-3 px-4 font-semibold text-white">{row.tenantName}</td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400 tabular-nums">
                      {row.activeRoutesCount} ruta(s)
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300 tabular-nums">
                      {formatCOP(feePerActiveRouteCOP)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-white tabular-nums">
                      {formatCOP(row.activeRoutesCount * feePerActiveRouteCOP)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-950/60 border border-rose-500/30 text-rose-300 font-mono text-[11px]">
                        <Lock className="w-3 h-3" />
                        OCULTO / PROHIBIDO POR RLS
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <SuperAdminTenantsManager />
      </div>
    );
  }

  // =========================================================================
  // BLOQUEO CONDICIONAL (PAYWALL WOMPI): Si la suscripción no está activa,
  // oculta el panel del administrador y renderiza únicamente el botón de pago.
  // =========================================================================
  if (!isSubscriptionActive && !isSuperAdmin) {
    return (
      <SubscriptionPaywall
        tenantId={tenantId}
        customerEmail={profile?.email || user?.email}
        customerName={profile?.fullName}
        onSubscriptionActivated={() => setIsSubscriptionActive(true)}
      />
    );
  }

  // =========================================================================
  // ARQUITECTURA DE PANEL DE CONTROL CON MENÚ LATERAL (SIDEBAR + CONTENT)
  // =========================================================================
  return (
    <div className="flex flex-col lg:flex-row min-h-[750px] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* BOTÓN HAMBURGUESA MÓVIL */}
      <div className="lg:hidden bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
            RC
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">Panel Admin RutaCapital</h3>
            <span className="text-[11px] text-emerald-400 font-mono">{profile?.organizationName || 'Medellín Sur'}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 bg-slate-800 text-slate-200 rounded-lg border border-slate-700"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* MENÚ LATERAL (SIDEBAR) */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } lg:block bg-slate-900 border-r border-slate-800 w-full lg:w-72 shrink-0 flex flex-col justify-between transition-all duration-300`}
      >
        <div className="p-4 sm:p-5 space-y-6">
          {/* Cabecera del Sidebar */}
          <div className="hidden lg:flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white font-bold text-sm shadow-md">
                RC
              </div>
              {!sidebarCollapsed && (
                <div>
                  <h3 className="text-white font-bold text-sm tracking-tight">Panel Administrador</h3>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    {profile?.organizationId || 'org-medellin-01'}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors"
              title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Lista de Navegación del Sidebar */}
          <nav className="space-y-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('dashboard');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>1. Dashboard General</span>}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('gestion_cobradores');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'gestion_cobradores'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>2. Gestión de Cobradores</span>}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('lista_clientes');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'lista_clientes'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>3. Lista de Clientes & Créditos</span>}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('liquidated_history');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'liquidated_history' || activeTab === 'liquidados_historico'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>4. Historial Liquidados</span>}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('scoring_riesgo');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'scoring_riesgo'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <BrainCircuit className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>5. Scoring & Alertas PAR 30</span>}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('cierre_caja');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'cierre_caja'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <FileCheck className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>6. Monitoreo de Rutas & Arqueos</span>}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('simulador_cfo');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'simulador_cfo'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <Calculator className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>7. Simulador Financiero TEA</span>}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('auditoria');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'auditoria'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>8. Bitácora SHA-256</span>}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('auditoria_gps');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'auditoria_gps'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <MapPin className="w-4 h-4 shrink-0 text-emerald-400" />
              {!sidebarCollapsed && <span>Auditoría GPS (Mapa)</span>}
            </button>

            <button
              type="button"
              onClick={() => navigateAdminTab('historial_pagos')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'historial_pagos'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <Receipt className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>9. Historial de Pagos</span>}
            </button>

            <button
              type="button"
              onClick={() => navigateAdminTab('suscripcion')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                activeTab === 'suscripcion'
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-950/60'
                  : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50 hover:text-white'
              }`}
            >
              <CreditCard className="w-4 h-4 shrink-0 text-emerald-400" />
              {!sidebarCollapsed && <span>Suscripción y Pagos (Wompi)</span>}
            </button>
          </nav>
        </div>

        {/* Footer del Sidebar con Acciones de Enlace */}
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/40 space-y-2">
            <div className="text-[11px] text-slate-400 font-mono">
              Inquilino: <span className="text-emerald-400">{profile?.organizationName || 'Medellín Sur'}</span>
            </div>
            {onOpenNewClientModal && (
              <button
                type="button"
                onClick={onOpenNewClientModal}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Registrar Nuevo Crédito</span>
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ÁREA DE CONTENIDO CENTRAL A LA DERECHA */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-slate-950 overflow-y-auto space-y-6">
        {/* =====================================================================
            VISTA 1: DASHBOARD LIMPIO (MÉTRICAS CLAVE POR DEFECTO)
           ===================================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Panel de Control Ejecutivo</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-emerald-400">{profile?.organizationName || 'RutaCapital'}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight mt-1">
                    Dashboard Financiero & Métricas de Liquidez
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Resumen consolidado en tiempo real de cartera colocada, recaudo bruto diario y flujos de caja netos.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {onOpenNewClientModal && (
                    <button
                      type="button"
                      onClick={onOpenNewClientModal}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Nuevo Crédito</span>
                    </button>
                  )}
                    <button
                      type="button"
                      onClick={() => setActiveTab('cierre_caja')}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileCheck className="w-4 h-4 text-emerald-400" />
                      <span>Ver Arqueos</span>
                    </button>
                </div>
              </div>

              {/* Grid de Métricas Clave */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                    <span>Recaudo Bruto del Día</span>
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white mt-2 font-mono tabular-nums">
                    {formatCOP(totalGrossCollected)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    <span>{loans.filter((l) => l.todayPaid).length} abonos hoy</span>
                    <span className="mx-1.5">·</span>
                    <span>{routes.length} rutas</span>
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                    <span>Cartera Total Colocada</span>
                    <TrendingUp className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="text-2xl font-bold text-teal-300 mt-2 font-mono tabular-nums">
                    {formatCOP(totalPortfolio)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    <span>{loans.filter((l) => l.status === 'activo').length} créditos activos</span>
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                    <span>Gastos Operativos (OpEx)</span>
                    <Fuel className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-amber-300 mt-2 font-mono tabular-nums">
                    {formatCOP(totalExpenses)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Combustible y mantenimiento</div>
                </div>

                <div className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-5">
                  <div className="flex items-center justify-between text-emerald-300 text-xs font-semibold">
                    <span>Flujo de Caja Neto</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono tabular-nums">
                    {formatCOP(netCashFlow)}
                  </div>
                  <div className="text-xs text-slate-300 mt-1 tabular-nums">
                    Margen neto: <strong className="text-white">{netMarginPercent.toFixed(1)}%</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Gráfico Recharts: Tendencia de Recaudación Diaria y Liquidez Disponible (Última Semana) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    Tendencia de Recaudación Diaria vs. Liquidez Disponible (Última Semana)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Análisis de flujo de caja operativo y disponibilidad de capital en efectivo/bancos (Medellín - Microcréditos gota a gota).
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                    <span className="text-slate-300">Recaudo Diario</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-cyan-400 inline-block"></span>
                    <span className="text-slate-300">Liquidez Disponible</span>
                  </div>
                </div>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={[
                      { day: 'Lun', recaudo: 2450000, liquidez: 15200000 },
                      { day: 'Mar', recaudo: 2890000, liquidez: 14800000 },
                      { day: 'Mié', recaudo: 3120000, liquidez: 16100000 },
                      { day: 'Jue', recaudo: 2950000, liquidez: 15900000 },
                      { day: 'Vie', recaudo: 4150000, liquidez: 18400000 },
                      { day: 'Sáb', recaudo: 4890000, liquidez: 21200000 },
                      { day: 'Dom', recaudo: totalGrossCollected > 0 ? totalGrossCollected : 1980000, liquidez: totalPortfolio > 0 ? totalPortfolio * 0.4 : 19500000 },
                    ]}
                    margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 12 }} />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                      formatter={(value: any) => [formatCOP(Number(value)), '']}
                    />
                    <Line
                      type="monotone"
                      dataKey="recaudo"
                      name="Recaudo Diario"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#10b981' }}
                      activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="liquidez"
                      name="Liquidez Disponible"
                      stroke="#06b6d4"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#06b6d4' }}
                      activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Accesos Rápidos a Secciones Operativas en Tarjetas Resumen */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                onClick={() => setActiveTab('gestion_cobradores')}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 cursor-pointer transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 mb-3 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-white font-bold text-base">Gestión de Cobradores</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Administre usuarios de cobro callejero, credenciales de dispositivo y bases semanales de efectivo.
                </p>
                <div className="mt-4 text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <span>Gestionar equipo</span>
                  <span>→</span>
                </div>
              </div>

              <div
                onClick={() => setActiveTab('scoring_riesgo')}
                className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 cursor-pointer transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 mb-3 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <h3 className="text-white font-bold text-base">Scoring & Alertas PAR 30</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Monitoree mora crítica con más de 2 días de atraso, bloqueo preventivo y reestructuración asistida.
                </p>
                <div className="mt-4 text-xs font-semibold text-amber-400 flex items-center gap-1">
                  <span>Ver alertas ({highRiskOverdueLoans.length})</span>
                  <span>→</span>
                </div>
              </div>

              <div
                onClick={() => setActiveTab('cierre_caja')}
                className="bg-slate-900 border border-slate-800 hover:border-teal-500/50 rounded-2xl p-5 cursor-pointer transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-teal-500/15 flex items-center justify-center text-teal-400 mb-3 group-hover:bg-teal-500 group-hover:text-white transition-colors">
                  <FileCheck className="w-5 h-5" />
                </div>
                <h3 className="text-white font-bold text-base">Monitoreo de Rutas & Arqueos</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Ejecute arqueos de caja diarios, control estricto de faltantes/sobrantes y punto de equilibrio operativo.
                </p>
                <div className="mt-4 text-xs font-semibold text-teal-400 flex items-center gap-1">
                  <span>Realizar arqueo</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            VISTA 2: GESTIÓN DE COBRADORES & BASES
           ===================================================================== */}
        {activeTab === 'gestion_cobradores' && (
          <div className="space-y-6">
            <SuperAdminTenantsManager />
            <AdminCollectorUsersManager
              routes={routes}
              onCollectorCreated={onCollectorCreated}
              onSwitchToCollectorView={() => onNavigateToTab && onNavigateToTab('collector_street')}
            />
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
            VISTA 3: LISTA DE CLIENTES & BÚSQUEDA
           ===================================================================== */}
        {activeTab === 'lista_clientes' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Lista de Clientes y Cartera Activa por Ruta
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Buscador instantáneo en tiempo real y administración de créditos vigentes
                </p>
              </div>

              {onOpenNewClientModal && (
                <button
                  type="button"
                  onClick={onOpenNewClientModal}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Nuevo Cliente / Crédito</span>
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={adminClientSearch}
                onChange={(e) => setAdminClientSearch(e.target.value)}
                placeholder="Buscar por nombre de cliente, comercio o teléfono..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Cliente / Comercio</th>
                    <th className="py-3 px-4">Teléfono</th>
                    <th className="py-3 px-4">Ruta</th>
                    <th className="py-3 px-4 text-right">Saldo Pendiente</th>
                    <th className="py-3 px-4 text-right">Cuota Diaria</th>
                    <th className="py-3 px-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 bg-slate-950/40">
                  {loans
                    .filter((loan) => {
                      const client = clients.find((c) => c.id === loan.clientId);
                      const q = adminClientSearch.trim().toLowerCase();
                      if (!q) return true;
                      const phoneRaw = client?.phone || '';
                      return (
                        loan.clientName.toLowerCase().includes(q) ||
                        loan.tradeName.toLowerCase().includes(q) ||
                        phoneRaw.toLowerCase().includes(q)
                      );
                    })
                    .map((loan) => {
                      const client = clients.find((c) => c.id === loan.clientId);
                      return (
                        <tr key={loan.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{loan.clientName}</div>
                            <div className="text-[11px] text-slate-400">{loan.tradeName}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-emerald-300 text-[11px]">
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {client?.phone || 'Sin teléfono'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300 text-[11px]">{loan.routeId}</td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-white tabular-nums">
                            {formatCOP(loan.remainingBalance)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums">
                            {formatCOP(loan.installmentAmount)}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2.5 py-1 rounded-md text-[11px] font-medium font-mono ${
                                loan.status === 'activo'
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                  : loan.status === 'mora_severa'
                                    ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                                    : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {loan.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =====================================================================
            VISTA 4: SCORING DE RIESGO & ALERTAS PAR 30
           ===================================================================== */}
        {activeTab === 'scoring_riesgo' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
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
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Bot className="w-4 h-4" />
                  <span>Asistente IA de Negociación</span>
                </button>
              </div>
            </div>

            {anomalies.length > 0 && (
              <div className="bg-rose-950/30 border border-rose-800/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs">
                  <span className="font-bold text-white block">{anomalies.length} Anomalía(s) Operativa(s)</span>
                  <span className="text-rose-300">{anomalies[0].message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRiskModal(true)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
                >
                  Ver Intelligence Modal
                </button>
              </div>
            )}

            {highRiskOverdueLoans.length === 0 ? (
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-8 text-center">
                <p className="text-xs text-slate-300 font-medium">Sin préstamos con mora crítica en este momento.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Cliente / Comercio</th>
                      <th className="py-3 px-4">Ruta</th>
                      <th className="py-3 px-4">Atraso</th>
                      <th className="py-3 px-4 text-right">Saldo Pendiente</th>
                      <th className="py-3 px-4 text-right">Cuota Diaria</th>
                      <th className="py-3 px-4">Bloqueo</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 bg-slate-950/40">
                    {highRiskOverdueLoans.map((loan) => {
                      const client = clients.find((c) => c.id === loan.clientId);
                      const isBlocked = client?.hasPreventiveBlock ?? true;

                      return (
                        <tr key={loan.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{loan.clientName}</div>
                            <div className="text-[11px] text-slate-400">{loan.tradeName}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">{loan.routeId}</td>
                          <td className="py-3 px-4 text-rose-300 font-medium tabular-nums">{loan.daysOverdue} días</td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-rose-200 tabular-nums">
                            {formatCOP(loan.remainingBalance)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums">
                            {formatCOP(loan.installmentAmount)}
                          </td>
                          <td className="py-3 px-4">
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
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setShowAiNegotiatorModal(true)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
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
          </div>
        )}

        {/* =====================================================================
            VISTA 5: MONITOREO DE RUTAS & ARQUEOS DE CAJA
           ===================================================================== */}
        {activeTab === 'cierre_caja' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Monitoreo de Rutas, Punto de Equilibrio y Arqueo de Caja
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cierre estricto con validación obligatoria de discrepancias (faltante / sobrante) en efectivo físico
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
                    className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4"
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
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shrink-0 cursor-pointer shadow-sm"
                      >
                        <FileCheck className="w-4 h-4" />
                        <span>Arqueo de Caja</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-[11px] block">Recaudo Hoy</span>
                        <span className="text-sm font-bold text-emerald-400 font-mono tabular-nums">
                          {formatCOP(route.dailyGrossCollected)}
                        </span>
                      </div>

                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-[11px] block">OpEx Fijo/Día</span>
                        <span className="text-sm font-bold text-amber-300 font-mono tabular-nums">
                          {formatCOP(route.fixedDailyOpex)}
                        </span>
                      </div>

                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-[11px] block">Créditos Activos</span>
                        <span className="text-sm font-bold text-white font-mono tabular-nums">
                          {route.activeLoansCount} / {breakEven.breakEvenActiveLoans} mín
                        </span>
                      </div>

                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-[11px] block">Mora PAR-30</span>
                        <span className="text-sm font-bold text-rose-400 font-mono tabular-nums">
                          {route.par30Rate}%
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Cobertura de Punto de Equilibrio ({coverageRatio.toFixed(1)}x)</span>
                        <span className={isHealthy ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                          {isHealthy ? 'Rentabilidad Óptima' : 'En Umbral'}
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
          </div>
        )}

        {/* =====================================================================
            VISTA 6: SIMULADOR FINANCIERO TEA
           ===================================================================== */}
        {activeTab === 'simulador_cfo' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Simulador Financiero de Microcréditos & TEA Implícita</h3>
                <p className="text-xs text-slate-400">Calibración de cuotas diarias, amortización y reserva de liquidez</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4 text-xs">
                <div>
                  <label className="text-slate-300 font-medium block mb-1.5">
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">Tasa Flat</label>
                    <select
                      value={simRate}
                      onChange={(e) => setSimRate(Number(e.target.value))}
                      className="w-full bg-slate-950 text-slate-200 rounded-xl p-2.5 border border-slate-800"
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
                      className="w-full bg-slate-950 text-slate-200 rounded-xl p-2.5 border border-slate-800"
                    >
                      <option value={20}>20 Días</option>
                      <option value={24}>24 Días</option>
                      <option value={30}>30 Días</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1.5">
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

              <div className="lg:col-span-5 bg-slate-950/90 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
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
                <div className="border-t border-slate-800 pt-2.5 flex justify-between items-center">
                  <span className="text-slate-300">Total a Recaudar:</span>
                  <span className="font-bold text-emerald-300 font-mono tabular-nums">
                    {formatCOP(simResult.totalDebt)}
                  </span>
                </div>
                <div className="border-t border-slate-800 pt-2.5 flex justify-between items-center">
                  <span className="text-slate-400">Colchón de Liquidez:</span>
                  <span className="font-bold text-rose-300 font-mono tabular-nums">
                    {formatCOP(simResult.liquidityBufferRequired)}
                  </span>
                </div>
                <div className="border-t border-slate-800 pt-2.5 flex justify-between items-center">
                  <span className="text-slate-400">TEA Implícita:</span>
                  <span className="font-bold text-amber-300 font-mono tabular-nums">
                    {simResult.implicitTEA.toFixed(0)}% E.A.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            VISTA 7: BITÁCORA SHA-256
           ===================================================================== */}
        {activeTab === 'auditoria' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Bitácora de Auditoría Inmutable (SHA-256)</h3>
                <p className="text-xs text-slate-400">Registro histórico de eventos críticos y transacciones de caja</p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-6 text-center space-y-3">
              <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Cadena de Bloques de Auditoría Segura</h4>
              <p className="text-xs text-slate-400 max-w-xl mx-auto">
                Todas las operaciones de crédito, arqueos con discrepancia, bloqueos preventivos y reestructuraciones quedan firmadas criptográficamente.
              </p>
              {onNavigateToTab && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab('audit_logs')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>Abrir Visor Completo de Auditoría</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            VISTA: HISTORIAL DE CRÉDITOS LIQUIDADOS (.eq('status', 'liquidated'))
           ===================================================================== */}
        {(activeTab === 'liquidated_history' || activeTab === 'liquidados_historico') && (
          <LiquidatedHistoryView
            organizationId={profile?.organizationId || 'org-medellin-01'}
            loans={loans}
            clients={clients}
            routes={routes}
            onOpenNewClientModal={onOpenNewClientModal}
          />
        )}

        {/* =====================================================================
            VISTA: HISTORIAL DE PAGOS Y COMPROBANTES WOMPI (`payment_receipts`)
           ===================================================================== */}
        {activeTab === 'historial_pagos' && (
          <HistorialPagos tenantId={tenantId} />
        )}

        {activeTab === 'auditoria_gps' && (
          <GpsAuditTrackerModule
            routes={routes}
            clients={clients}
            loans={loans}
            ledger={ledger}
          />
        )}

        {/* =====================================================================
            VISTA DEDICADA AL PAGO (/admin/suscripcion): GESTIONAR SUSCRIPCIÓN WOMPI
           ===================================================================== */}
        {activeTab === 'suscripcion' && (
          <GestionarSuscripcionView
            tenantId={tenantId}
            onSubscriptionActivated={() => setIsSubscriptionActive(true)}
          />
        )}
      </main>

      {/* MODALES OPERATIVOS GLOBALES */}
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
          onConfirmReconciliation={(routeId, actualCash, discrepancy, notes, sessionRecord) => {
            onConfirmReconciliation(routeId, actualCash, discrepancy, notes, sessionRecord);
            setReconcilingRoute(null);
          }}
          onClose={() => setReconcilingRoute(null)}
        />
      )}
    </div>
  );
};
