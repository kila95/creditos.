import React, { useState, useMemo, useEffect } from 'react';
import {
  History,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  UserPlus,
  Lock,
  ArrowUpRight,
  Calendar,
  DollarSign,
  TrendingUp,
  Percent,
  Phone,
  Store,
  RefreshCw,
  LayoutGrid,
  Table as TableIcon,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  ExternalLink,
  Info,
} from 'lucide-react';
import { RouteData, ClientProfile, LoanDetail } from '../data/mockData';
import { formatCOP, roundCOP } from '../utils/financialCalculations';
import { supabase, isLiveSupabaseConfigured } from '../services/supabaseAuth';
import { NewClientLoanModal } from './NewClientLoanModal';

export type ViabilityTier = 'verde' | 'amarillo' | 'rojo';

export interface ViabilityAssessment {
  tier: ViabilityTier;
  label: 'Apto para crédito' | 'Revisar historial' | 'No prestar';
  badgeClass: string;
  dotClass: string;
  icon: React.ElementType;
  daysDiff: number; // <= 0: Pagó a tiempo o antes; > 0: Días de demora
  daysDiffText: string;
  daysPactados: number;
  daysReales: number;
  cfoRecommendation: string;
  canRenew: boolean;
}

export interface LiquidatedHistoryViewProps {
  organizationId?: string;
  loans?: LoanDetail[];
  clients?: ClientProfile[];
  routes?: RouteData[];
  onOpenNewClientModal?: () => void;
  onRenewLoan?: (client: ClientProfile, previousLoan: LoanDetail) => void;
  onLoanCreatedForExistingClient?: (newLoan: LoanDetail) => void;
  onClientCreated?: (newClient: ClientProfile, newLoan: LoanDetail) => void;
}

/**
 * Calcula el semáforo automático de viabilidad financiera:
 * - Verde ("Apto para crédito"): Pagó en el tiempo establecido o antes (días extra <= 0).
 * - Amarillo ("Revisar historial"): Se demoró entre 1 y 5 días adicionales (1 <= días extra <= 5).
 * - Rojo ("No prestar"): Tuvo un atraso crítico de más de 5 días (días extra > 5).
 */
export function calculateViability(loan: LoanDetail): ViabilityAssessment {
  const startDateStr = loan.disbursedDate || loan.dueDate || new Date().toISOString().split('T')[0];
  const dueDateStr = loan.dueDate || startDateStr;
  const liqDateStr = loan.liquidationDate || dueDateStr;

  const startDate = new Date(startDateStr);
  const dueDate = new Date(dueDateStr);
  const liqDate = new Date(liqDateStr);

  // Plazo pactado en días
  const daysPactados = loan.termDays > 0 ? loan.termDays : Math.max(1, Math.round((dueDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

  // Plazo real que tomó pagar
  const calculatedRealDays = Math.max(1, Math.round((liqDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const daysReales = calculatedRealDays > 0 ? calculatedRealDays : daysPactados;

  // Demora o diferencia frente al plazo pactado
  // Si tiene daysOverdue registrado en el préstamo liquidado lo usamos como referencia de rigor
  let daysDiff = 0;
  if (loan.daysOverdue !== undefined && loan.daysOverdue > 0) {
    daysDiff = loan.daysOverdue;
  } else if (!isNaN(dueDate.getTime()) && !isNaN(liqDate.getTime())) {
    daysDiff = Math.round((liqDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Reglas matemáticas estrictas solicitadas:
  if (daysDiff <= 0) {
    // Pagó a tiempo o antes
    const advanceDays = Math.abs(daysDiff);
    return {
      tier: 'verde',
      label: 'Apto para crédito',
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
      dotClass: 'bg-emerald-400',
      icon: CheckCircle2,
      daysDiff,
      daysDiffText: advanceDays === 0 ? 'Pagó exactamente el día pactado' : `Pagó ${advanceDays} día(s) antes del plazo`,
      daysPactados,
      daysReales: Math.min(daysPactados, daysReales),
      cfoRecommendation: 'Riesgo bajo. Flujo de caja comprobado. Apto para renovación inmediata e incremento de cupo sugerido (+20%).',
      canRenew: true,
    };
  } else if (daysDiff >= 1 && daysDiff <= 5) {
    // Demora leve entre 1 y 5 días
    return {
      tier: 'amarillo',
      label: 'Revisar historial',
      badgeClass: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
      dotClass: 'bg-amber-400',
      icon: AlertTriangle,
      daysDiff,
      daysDiffText: `Demora leve de +${daysDiff} día(s) sobre el vencimiento`,
      daysPactados,
      daysReales: daysPactados + daysDiff,
      cfoRecommendation: 'Riesgo moderado. Tolerancia aceptable en calle. Se sugiere renovar con el mismo monto sin aumento de capital.',
      canRenew: true,
    };
  } else {
    // Atraso crítico superior a 5 días
    return {
      tier: 'rojo',
      label: 'No prestar',
      badgeClass: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
      dotClass: 'bg-rose-400',
      icon: XCircle,
      daysDiff,
      daysDiffText: `Atraso crítico de +${daysDiff} día(s) (Mora severa)`,
      daysPactados,
      daysReales: daysPactados + daysDiff,
      cfoRecommendation: 'Riesgo crítico. Generó iliquidez y retraso prolongado. Se desaconseja totalmente la concesión de nuevo capital.',
      canRenew: false,
    };
  }
}

export const LiquidatedHistoryView: React.FC<LiquidatedHistoryViewProps> = ({
  organizationId = 'org-medellin-01',
  loans = [],
  clients = [],
  routes = [],
  onOpenNewClientModal,
  onRenewLoan,
  onLoanCreatedForExistingClient,
  onClientCreated,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'verde' | 'amarillo' | 'rojo'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estado para el modal de renovación precargada
  const [renewalClient, setRenewalClient] = useState<ClientProfile | null>(null);
  const [renewalLoan, setRenewalLoan] = useState<LoanDetail | null>(null);
  const [showRenewalModal, setShowRenewalModal] = useState(false);

  // Filtrar exclusivamente préstamos con status === 'liquidated' (o 'liquidado')
  const liquidatedLoans = useMemo(() => {
    return loans.filter(
      (l) =>
        (l.status === 'liquidated' || (l.status as string) === 'liquidado') &&
        (l.organizationId ? l.organizationId === organizationId : true)
    );
  }, [loans, organizationId]);

  // Enriquecer cada crédito liquidado con su cliente y evaluación semafórica
  const enrichedHistory = useMemo(() => {
    return liquidatedLoans.map((loan) => {
      const client = clients.find((c) => c.id === loan.clientId) || {
        id: loan.clientId,
        name: loan.clientName || 'Cliente No Registrado',
        tradeName: loan.tradeName || 'Comercio Local',
        category: 'Comercio',
        document: 'S/D',
        phone: '',
        address: 'Medellín',
        neighborhood: 'Sector Urbano',
        routeId: loan.routeId,
        riskTier: 'B_promedio' as const,
        daysOverdue: 0,
        hasPreventiveBlock: false,
        guarantorName: '',
        guarantorPhone: '',
        lat: 6.2442,
        lng: -75.5812,
      };

      const route = routes.find((r) => r.id === loan.routeId);
      const viability = calculateViability(loan);

      return {
        loan,
        client,
        route,
        viability,
      };
    });
  }, [liquidatedLoans, clients, routes]);

  // Aplicar filtros de búsqueda y semáforo
  const filteredHistory = useMemo(() => {
    return enrichedHistory.filter(({ loan, client, route, viability }) => {
      // Filtro semáforo
      if (tierFilter !== 'all' && viability.tier !== tierFilter) {
        return false;
      }

      // Filtro por ruta
      if (selectedRouteFilter !== 'all' && loan.routeId !== selectedRouteFilter) {
        return false;
      }

      // Búsqueda textual
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      return (
        client.name.toLowerCase().includes(term) ||
        (client.tradeName && client.tradeName.toLowerCase().includes(term)) ||
        client.document.toLowerCase().includes(term) ||
        loan.code.toLowerCase().includes(term) ||
        (client.phone && client.phone.includes(term)) ||
        (route && route.name.toLowerCase().includes(term))
      );
    });
  }, [enrichedHistory, tierFilter, selectedRouteFilter, searchTerm]);

  // Métricas de CFO consolidadas
  const metrics = useMemo(() => {
    const totalCount = enrichedHistory.length;
    const greenCount = enrichedHistory.filter((i) => i.viability.tier === 'verde').length;
    const yellowCount = enrichedHistory.filter((i) => i.viability.tier === 'amarillo').length;
    const redCount = enrichedHistory.filter((i) => i.viability.tier === 'rojo').length;

    const totalRecoveredPrincipal = enrichedHistory.reduce((sum, i) => sum + i.loan.principal, 0);
    const totalInterestCollected = enrichedHistory.reduce(
      (sum, i) => sum + roundCOP(i.loan.totalCollected - i.loan.principal),
      0
    );

    const approvalRate = totalCount > 0 ? Math.round(((greenCount + yellowCount) / totalCount) * 100) : 0;

    return {
      totalCount,
      greenCount,
      yellowCount,
      redCount,
      totalRecoveredPrincipal,
      totalInterestCollected,
      approvalRate,
    };
  }, [enrichedHistory]);

  const handleOpenRenewal = (client: ClientProfile, loan: LoanDetail) => {
    if (onRenewLoan) {
      onRenewLoan(client, loan);
    }
    setRenewalClient(client);
    setRenewalLoan(loan);
    setShowRenewalModal(true);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (isLiveSupabaseConfigured) {
        await supabase
          .from('loans')
          .select('*')
          .in('status', ['liquidated', 'liquidado']);
      }
    } catch (err) {
      console.warn('Refresh notice:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  return (
    <div className="space-y-6">
      {/* =====================================================================
          1. HEADER PRINCIPAL Y FILOSOFÍA DE CRÉDITO DEL CFO
         ===================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <History className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500 text-slate-950 uppercase tracking-wider">
                  Módulo de Viabilidad &amp; Re-colocación
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Filtro: <code className="text-emerald-400">status === &apos;liquidated&apos;</code>
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
                Historial de Créditos Liquidados
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Evaluación algorítmica del comportamiento de repago frente al plazo pactado. Permite determinar
                inmediatamente si un cliente liquidado califica para renovación de capital sin poner en riesgo la
                liquidez del fondo.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Refrescar estado de liquidados"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
              <span>{isRefreshing ? 'Actualizando...' : 'Refrescar'}</span>
            </button>

            {onOpenNewClientModal && (
              <button
                type="button"
                onClick={onOpenNewClientModal}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950/40 transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Nuevo Crédito Libre</span>
              </button>
            )}
          </div>
        </div>

        {/* TARJETAS RESUMEN DE MÉTRICAS CFO */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5 mt-5">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-slate-400 text-[11px] block">Créditos Liquidados</span>
            <div className="text-xl font-bold text-white font-mono mt-1 tabular-nums">
              {metrics.totalCount}
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block">100% Saldo $0 COP</span>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-emerald-400 text-[11px]">
              <span>🟢 Aptos (Verde)</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold text-emerald-300 font-mono mt-1 tabular-nums">
              {metrics.greenCount}
            </div>
            <span className="text-[10px] text-emerald-400/80 mt-0.5 block">A tiempo o anticipado</span>
          </div>

          <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-amber-400 text-[11px]">
              <span>🟡 Revisar (Amarillo)</span>
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold text-amber-300 font-mono mt-1 tabular-nums">
              {metrics.yellowCount}
            </div>
            <span className="text-[10px] text-amber-400/80 mt-0.5 block">Demora 1 a 5 días</span>
          </div>

          <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-rose-400 text-[11px]">
              <span>🔴 No Prestar (Rojo)</span>
              <XCircle className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold text-rose-300 font-mono mt-1 tabular-nums">
              {metrics.redCount}
            </div>
            <span className="text-[10px] text-rose-400/80 mt-0.5 block">Atraso &gt; 5 días</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-slate-400 text-[11px] block">Capital Recuperado</span>
            <div className="text-base sm:text-lg font-bold text-emerald-400 font-mono mt-1 tabular-nums">
              {formatCOP(metrics.totalRecoveredPrincipal)}
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block">Principal devuelto</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-slate-400 text-[11px] block">Tasa de Re-colocación</span>
            <div className="text-xl font-bold text-white font-mono mt-1 tabular-nums">
              {metrics.approvalRate}%
            </div>
            <span className="text-[10px] text-emerald-400 mt-0.5 block">Clientes viables</span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. BARRA DE HERRAMIENTAS: BÚSQUEDA, FILTRO POR SEMÁFORO Y SELECTOR DE VISTA
         ===================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xs">
        {/* Buscador */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, cédula, comercio o código..."
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-xs text-slate-400 hover:text-white absolute right-3 top-1/2 -translate-y-1/2"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtros Semáforo */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setTierFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tierFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({metrics.totalCount})
            </button>
            <button
              type="button"
              onClick={() => setTierFilter('verde')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                tierFilter === 'verde'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-400 hover:bg-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Aptos ({metrics.greenCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setTierFilter('amarillo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                tierFilter === 'amarillo'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-400 hover:bg-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Revisar ({metrics.yellowCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setTierFilter('rojo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                tierFilter === 'rojo'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-400 hover:bg-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>No Prestar ({metrics.redCount})</span>
            </button>
          </div>

          {/* Selector de Ruta */}
          {routes.length > 1 && (
            <select
              value={selectedRouteFilter}
              onChange={(e) => setSelectedRouteFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Todas las Rutas</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.zone})
                </option>
              ))}
            </select>
          )}

          {/* Toggle Grid / Table */}
          <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Vista de Cuadrícula"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Vista de Tabla Detallada"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. CUADRÍCULA / LISTADO DE CLIENTES LIQUIDADOS
         ===================================================================== */}
      {filteredHistory.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto">
            <History className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white mt-4">
            No se encontraron créditos liquidados
          </h3>
          <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto">
            {searchTerm || tierFilter !== 'all'
              ? 'No hay registros que coincidan con los filtros aplicados. Intenta restablecer la búsqueda.'
              : 'Cuando un cobrador en calle o el administrador complete la liquidación total de un crédito (saldo <= $0 COP), aparecerá automáticamente aquí con su análisis de viabilidad.'}
          </p>
          {(searchTerm || tierFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setTierFilter('all');
                setSelectedRouteFilter('all');
              }}
              className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Limpiar Filtros
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* VISTA EN CUADRÍCULA (CARDS DETALLADAS CON ALTO VALOR ANALÍTICO) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredHistory.map(({ loan, client, route, viability }) => {
            const Icon = viability.icon;

            return (
              <div
                key={loan.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-sm transition-all duration-200 flex flex-col justify-between space-y-4"
              >
                {/* Cabecera de la Tarjeta */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-base font-bold text-white tracking-tight truncate" title={client.name}>
                        {client.name}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 truncate">
                        <Store className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{client.tradeName || 'Comercio Local'}</span>
                      </div>
                    </div>

                    {/* SEMÁFORO DE VIABILIDAD VISUAL */}
                    <div
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 ${viability.badgeClass}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{viability.label}</span>
                    </div>
                  </div>

                  {/* Cédula y Teléfono */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-2 font-mono">
                    <span>CC: {client.document}</span>
                    {client.phone && (
                      <a
                        href={`https://wa.me/57${client.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline flex items-center gap-1"
                        title="Abrir WhatsApp directo"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{client.phone}</span>
                      </a>
                    )}
                    {route && (
                      <span className="text-slate-500">· {route.name}</span>
                    )}
                  </div>
                </div>

                {/* BLOQUE DE DATOS FINANCIEROS Y TEMPORALES REQUERIDOS */}
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 space-y-2.5 text-xs">
                  {/* 1. Monto Original Prestado */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      Monto Original Prestado:
                    </span>
                    <span className="font-mono font-bold text-emerald-400 text-sm tabular-nums">
                      {formatCOP(loan.principal)}
                    </span>
                  </div>

                  {/* 2. Fechas: Inicio y Liquidación Real */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Fecha de Inicio:</span>
                      <span className="text-slate-200 font-mono font-semibold">
                        {loan.disbursedDate || 'No registra'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Fecha Real Liquidación:</span>
                      <span className="text-slate-200 font-mono font-semibold">
                        {loan.liquidationDate || loan.dueDate || 'Reciente'}
                      </span>
                    </div>
                  </div>

                  {/* 3. Comparativa de Tiempo: Pactado vs Real */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Plazo pactado:</span>
                      <span className="font-mono text-slate-300 font-semibold">
                        {viability.daysPactados} cuotas / días
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-1">
                      <span className="text-slate-400">Tiempo real de pago:</span>
                      <span className="font-mono text-slate-200 font-semibold">
                        {viability.daysReales} días
                      </span>
                    </div>

                    <div className="mt-2 text-[11px] font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span
                        className={
                          viability.tier === 'verde'
                            ? 'text-emerald-400'
                            : viability.tier === 'amarillo'
                            ? 'text-amber-400'
                            : 'text-rose-400 font-semibold'
                        }
                      >
                        {viability.daysDiffText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recomendación Técnica del CFO */}
                <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 text-[11px] text-slate-300 leading-relaxed">
                  <div className="flex items-center gap-1.5 text-slate-400 font-semibold mb-0.5">
                    <Info className="w-3 h-3 text-slate-400" />
                    <span>Dictamen Financiero:</span>
                  </div>
                  <p>{viability.cfoRecommendation}</p>
                </div>

                {/* ACCIÓN RÁPIDA DE RENOVACIÓN */}
                <div className="pt-2">
                  {viability.canRenew ? (
                    <button
                      type="button"
                      onClick={() => handleOpenRenewal(client, loan)}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
                        viability.tier === 'verde'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                          : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/50'
                      }`}
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Nuevo Préstamo (Precargar Datos)</span>
                    </button>
                  ) : (
                    <div
                      className="w-full py-2.5 px-4 bg-rose-950/30 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-not-allowed select-none"
                      title="Crédito bloqueado por exceso de mora (>5 días)"
                    >
                      <Lock className="w-4 h-4 text-rose-400" />
                      <span>Renovación Bloqueada por Mora Crítica</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VISTA EN TABLA FINANCIERA DE ALTA DENSIDAD */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-300">
              <thead className="text-[11px] uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Cliente / Negocio</th>
                  <th className="px-4 py-3.5">Monto Original</th>
                  <th className="px-4 py-3.5">Fecha Inicio</th>
                  <th className="px-4 py-3.5">Fecha Real Liquidación</th>
                  <th className="px-4 py-3.5">Desempeño / Tiempo</th>
                  <th className="px-4 py-3.5 text-center">Semáforo</th>
                  <th className="px-4 py-3.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredHistory.map(({ loan, client, route, viability }) => {
                  const Icon = viability.icon;

                  return (
                    <tr key={loan.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-white">
                        <div className="font-bold">{client.name}</div>
                        <div className="text-[11px] text-slate-400">{client.tradeName || 'Comercio'}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">CC: {client.document}</div>
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold text-emerald-400 tabular-nums">
                        {formatCOP(loan.principal)}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-300">
                        {loan.disbursedDate || 'No registra'}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-300">
                        {loan.liquidationDate || loan.dueDate || 'Reciente'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-[11px] text-slate-300">
                          {viability.daysReales} días de {viability.daysPactados} pactados
                        </div>
                        <div
                          className={`text-[10px] font-semibold mt-0.5 ${
                            viability.tier === 'verde'
                              ? 'text-emerald-400'
                              : viability.tier === 'amarillo'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {viability.daysDiffText}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${viability.badgeClass}`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{viability.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {viability.canRenew ? (
                          <button
                            type="button"
                            onClick={() => handleOpenRenewal(client, loan)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                              viability.tier === 'verde'
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-amber-600 hover:bg-amber-500 text-white'
                            }`}
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Nuevo Préstamo</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-rose-400 font-semibold inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>Bloqueado</span>
                          </span>
                        )}
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
          4. MODAL INTEGRADO DE RENOVACIÓN DE PRÉSTAMO CON DATOS PRECARGADOS
         ===================================================================== */}
      {showRenewalModal && renewalClient && (
        <NewClientLoanModal
          routes={routes}
          clients={clients}
          defaultSelectedClientId={renewalClient.id}
          suggestedAmount={renewalLoan ? roundCOP(renewalLoan.principal * 1.20) : undefined}
          onClose={() => {
            setShowRenewalModal(false);
            setRenewalClient(null);
            setRenewalLoan(null);
          }}
          onClientCreated={(newClient, newLoan) => {
            if (onClientCreated) onClientCreated(newClient, newLoan);
            setShowRenewalModal(false);
            setRenewalClient(null);
            setRenewalLoan(null);
          }}
          onLoanCreatedForExistingClient={(newLoan) => {
            if (onLoanCreatedForExistingClient) onLoanCreatedForExistingClient(newLoan);
            setShowRenewalModal(false);
            setRenewalClient(null);
            setRenewalLoan(null);
          }}
        />
      )}
    </div>
  );
};
