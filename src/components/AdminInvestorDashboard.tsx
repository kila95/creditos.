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
  RefreshCw,
  Sliders,
  BrainCircuit,
  ArrowRightLeft,
  Sparkles,
  FileCheck,
  Bot
} from 'lucide-react';
import { 
  RouteData, 
  ClientProfile, 
  LoanDetail, 
  RouteExpenseItem,
  LedgerEntry 
} from '../data/mockData';
import { 
  formatCOP, 
  calculateNetCashFlow, 
  calculateRouteBreakEven,
  simulateMicroloan 
} from '../utils/financialCalculations';
import { detectRouteAnomalies } from '../utils/scoringEngine';
import { RiskIntelligenceModal } from './RiskIntelligenceModal';
import { DynamicRouteAssignment } from './DynamicRouteAssignment';
import { DailyCashReconciliationModal } from './DailyCashReconciliationModal';
import { AiNegotiationAssistantModal } from './AiNegotiationAssistantModal';
import { NegotiationProposal } from '../utils/aiNegotiator';

interface AdminDashboardProps {
  routes: RouteData[];
  clients: ClientProfile[];
  loans: LoanDetail[];
  expenses: RouteExpenseItem[];
  ledger: LedgerEntry[];
  onRestructureLoan: (loanId: string) => void;
  onToggleClientBlock: (clientId: string) => void;
  onReassignClientRoute: (clientId: string, newRouteId: string) => void;
  onConfirmReconciliation: (routeId: string, actualCash: number, discrepancy: number, notes: string) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const AdminInvestorDashboard: React.FC<AdminDashboardProps> = ({
  routes,
  clients,
  loans,
  expenses,
  ledger,
  onRestructureLoan,
  onToggleClientBlock,
  onReassignClientRoute,
  onConfirmReconciliation,
  onNavigateToTab
}) => {
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

  // Filtro de ruta seleccionada
  const [selectedRouteId, setSelectedRouteId] = useState<string>('all');

  // Detección de anomalías en vivo
  const anomalies = detectRouteAnomalies(routes, loans, expenses);

  // Cálculos consolidados globales
  const totalPortfolio = loans.reduce((acc, l) => acc + (l.status === 'activo' || l.status === 'mora_severa' ? l.remainingBalance : 0), 0);
  const totalGrossCollected = routes.reduce((acc, r) => acc + r.dailyGrossCollected, 0);
  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  
  // Provisión obligatoria del 4% sobre recaudo bruto para cartera incobrable
  const { badDebtProvision, netCashFlow, netMarginPercent } = calculateNetCashFlow(
    totalGrossCollected,
    totalExpenses,
    4.0
  );

  // Clientes con 2 o más días de mora (Regla de Riesgo Obligatoria)
  const highRiskOverdueLoans = loans.filter(l => l.daysOverdue >= 2 && l.status !== 'liquidado');

  // Ejecución de simulación
  const simResult = simulateMicroloan(simPrincipal, simRate, simTerm, simDefaultRate);

  const handleApproveAiAgreement = (proposal: NegotiationProposal) => {
    // Al aprobar acuerdo IA, se actualiza el préstamo y se desbloquea
    const matchedLoan = loans.find(l => l.clientName === proposal.clientName);
    if (matchedLoan) {
      onRestructureLoan(matchedLoan.id);
    }
    setShowAiNegotiatorModal(false);
  };

  return (
    <div className="space-y-6">
      {/* HEADER DE MANDO EJECUTIVO (CFO) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                CFO Cockpit & Liquidity Hub
              </span>
              <span className="text-xs text-slate-400">Región: Medellín y Área Metropolitana</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-1">
              Consolidado de Caja & Margen Operativo Neto
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Fórmula en tiempo real: <span className="font-mono text-emerald-300">Net Cash Flow = Recaudo Bruto - Gastos Operativos - Provisión Cartera</span>
            </p>
          </div>

          {/* BOTONES DE OPERACIONES AVANZADAS */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAiNegotiatorModal(true)}
              className="px-3 py-2 bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/40 hover:to-indigo-600/40 text-purple-200 border border-purple-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-purple-950/40"
            >
              <Bot className="w-4 h-4 text-purple-400" />
              IA Negociador de Deuda
            </button>

            <button
              onClick={() => setShowRiskModal(true)}
              className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <BrainCircuit className="w-4 h-4 text-purple-400" />
              Scoring de Riesgo
            </button>

            <button
              onClick={() => setShowReassignModal(true)}
              className="px-3 py-2 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <ArrowRightLeft className="w-4 h-4 text-teal-400" />
              Asignación Dinámica
            </button>
          </div>
        </div>

        {/* ALERTA DE ANOMALÍAS EN RUTA */}
        {anomalies.length > 0 && (
          <div className="mt-4 bg-rose-950/30 border border-rose-800/50 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-white text-xs block">
                  {anomalies.length} Anomalía(s) Estadísticas Detectadas en Calle
                </span>
                <span className="text-[11px] text-rose-300/90 block">
                  {anomalies[0].message}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowRiskModal(true)}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shrink-0 ml-3"
            >
              Inspeccionar
            </button>
          </div>
        )}

        {/* METRIC CARDS DEL NET CASH FLOW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {/* 1. Recaudo Bruto */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Recaudo Bruto Diario</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {formatCOP(totalGrossCollected)}
            </div>
            <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1 font-medium">
              <span>{loans.filter(l => l.todayPaid).length} cobranzas hoy</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">4 rutas en calle</span>
            </div>
          </div>

          {/* 2. Gastos de Ruta (OpEx) */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Gastos Operativos Asignados</span>
              <Fuel className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-amber-300 mt-1">
              {formatCOP(totalExpenses)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Gasolina, motos, viáticos y datos móviles
            </div>
          </div>

          {/* 3. Provisión de Cartera (Colchón) */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Provisión Cartera Incobrable (4%)</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xl font-bold text-rose-300 mt-1">
              {formatCOP(badDebtProvision)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Fondo de contingencia obligatorio
            </div>
          </div>

          {/* 4. NET CASH FLOW REAL */}
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between text-emerald-300 text-xs font-semibold">
              <span>NET CASH FLOW (Margen Neto)</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              {formatCOP(netCashFlow)}
            </div>
            <div className="text-[11px] text-emerald-300/80 mt-1 font-medium">
              Margen neto operativo: <span className="font-bold text-white">{netMarginPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ALERTAS TEMPRANAS DE RIESGO: MORA >= 2 DÍAS (BLOQUEO Y REESTRUCTURACIÓN) */}
      <div className="bg-rose-950/20 border border-rose-900/40 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Protocolo de Mitigación de Riesgos: Alertas Tempranas (Mora ≥ 2 Días)
              </h3>
              <p className="text-xs text-rose-300/80">
                Regla obligatoria: Bloqueo preventivo de nuevos desembolsos y habilitación de reestructuración de plazo.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
            {highRiskOverdueLoans.length} caso(s) en alerta
          </span>
        </div>

        {highRiskOverdueLoans.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No hay créditos en mora crítica mayor o igual a 2 días.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Cliente / Negocio</th>
                  <th className="py-2.5 px-3">Ruta</th>
                  <th className="py-2.5 px-3">Días de Mora</th>
                  <th className="py-2.5 px-3">Saldo Insoluto</th>
                  <th className="py-2.5 px-3">Cuota Diaria</th>
                  <th className="py-2.5 px-3">Bloqueo Preventivo</th>
                  <th className="py-2.5 px-3 text-right">Acción de Mitigación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {highRiskOverdueLoans.map(loan => {
                  const client = clients.find(c => c.id === loan.clientId);
                  const isBlocked = client?.hasPreventiveBlock ?? true;

                  return (
                    <tr key={loan.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">{loan.clientName}</div>
                        <div className="text-[11px] text-slate-400">{loan.tradeName}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-300 font-mono text-[11px]">
                        {loan.routeId === 'route-1' ? 'Comuna 13' : 'Manrique'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          {loan.daysOverdue} días sin pagar
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-rose-200">
                        {formatCOP(loan.remainingBalance)}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {formatCOP(loan.installmentAmount)}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => onToggleClientBlock(loan.clientId)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                            isBlocked 
                              ? 'bg-rose-900/60 text-rose-200 border border-rose-700/60' 
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          <Lock className="w-3 h-3" />
                          {isBlocked ? 'Bloqueo Activo' : 'Desbloqueado'}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setShowAiNegotiatorModal(true)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-[11px] font-bold shadow-sm transition-all"
                        >
                          <Bot className="w-3 h-3" />
                          Negociar con IA
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

      {/* PUNTO DE EQUILIBRIO POR RUTA Y COSTOS OPERATIVOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Punto de Equilibrio de Cada Ruta de Cobro
              </h3>
              <p className="text-xs text-slate-400">
                Créditos mínimos al día necesarios para absorber la logística de calle (motos, combustible, viáticos del rutero)
              </p>
            </div>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700">
              Cartera Total: {formatCOP(totalPortfolio)}
            </span>
          </div>

          <div className="space-y-4">
            {routes.map(route => {
              const breakEven = calculateRouteBreakEven(route.fixedDailyOpex, 850000, 20, 24);
              const coverageRatio = (route.activeLoansCount / breakEven.breakEvenActiveLoans);
              const isHealthy = coverageRatio >= 1.5;

              return (
                <div key={route.id} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/40 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{route.name}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                          {route.code}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span>Rutero: {route.collectorName}</span>
                        <span className="text-slate-600">•</span>
                        <span>{route.zone}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Gasto Diario Fijo</div>
                        <div className="text-xs font-bold text-amber-300">{formatCOP(route.fixedDailyOpex)}/día</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Recaudo Hoy</div>
                        <div className="text-xs font-bold text-emerald-300">{formatCOP(route.dailyGrossCollected)}</div>
                      </div>
                      <button
                        onClick={() => setReconcilingRoute(route)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
                      >
                        <FileCheck className="w-3 h-3 text-amber-400" />
                        Arqueo
                      </button>
                    </div>
                  </div>

                  {/* Indicadores de equilibrio */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-400 text-[11px] block">Créditos en Equilibrio</span>
                      <span className="text-sm font-bold text-white">
                        {breakEven.breakEvenActiveLoans} créditos
                      </span>
                      <span className="text-[10px] text-slate-500 block">mínimo necesario</span>
                    </div>

                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-400 text-[11px] block">Créditos Activos Reales</span>
                      <span className="text-sm font-bold text-emerald-400">
                        {route.activeLoansCount} activos
                      </span>
                      <span className="text-[10px] text-emerald-500 block">
                        {(coverageRatio).toFixed(1)}x cobertura
                      </span>
                    </div>

                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-400 text-[11px] block">Mora PAR-1 (Alerta)</span>
                      <span className={`text-sm font-bold ${route.par1Rate > 5 ? 'text-amber-400' : 'text-slate-300'}`}>
                        {route.par1Rate}%
                      </span>
                      <span className="text-[10px] text-slate-500 block">atraso 1 día</span>
                    </div>

                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-400 text-[11px] block">Mora PAR-30 (Pérdida)</span>
                      <span className="text-sm font-bold text-rose-400">
                        {route.par30Rate}%
                      </span>
                      <span className="text-[10px] text-slate-500 block">castigo probable</span>
                    </div>
                  </div>

                  {/* Barra de progreso de equilibrio */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Eficiencia operativa y absorción de costos</span>
                      <span className={isHealthy ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                        {isHealthy ? 'Superávit Operativo Neto' : 'Ruta Cerca al Límite de Costos'}
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${isHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${Math.min(100, (route.activeLoansCount / (breakEven.breakEvenActiveLoans * 2)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SIMULADOR DE MICROCRÉDITOS & TEA IMPLÍCITA (CFO TOOL) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Calculator className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Simulador Financiero & TEA Implícita</h3>
                <p className="text-[11px] text-slate-400">Cálculo de cuota, colchón de liquidez y costo de capital</p>
              </div>
            </div>

            <div className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Monto de Capital (COP): <span className="text-white font-bold">{formatCOP(simPrincipal)}</span>
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
                  <label className="text-slate-300 font-medium block mb-1">
                    Tasa Mensual: <span className="text-emerald-300 font-bold">{simRate}% flat</span>
                  </label>
                  <select
                    value={simRate}
                    onChange={(e) => setSimRate(Number(e.target.value))}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700"
                  >
                    <option value={15}>15% Flat</option>
                    <option value={20}>20% Flat (Típico)</option>
                    <option value={25}>25% Flat</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Plazo en Días: <span className="text-white font-bold">{simTerm} días</span>
                  </label>
                  <select
                    value={simTerm}
                    onChange={(e) => setSimTerm(Number(e.target.value))}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700"
                  >
                    <option value={20}>20 Días hábiles</option>
                    <option value={24}>24 Días hábiles</option>
                    <option value={30}>30 Días corridos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Tasa de Morosidad Estimada: <span className="text-rose-300 font-bold">{simDefaultRate}%</span>
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

              {/* RESULTADOS DEL SIMULADOR */}
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 space-y-2 mt-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Cuota Diaria Fija:</span>
                  <span className="font-bold text-white text-base font-mono">{formatCOP(simResult.dailyInstallment)}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-400">
                  <span>- Amortización Capital:</span>
                  <span className="font-mono text-slate-300">{formatCOP(simResult.dailyPrincipalPortion)}/día</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-400">
                  <span>- Interés Devengado:</span>
                  <span className="font-mono text-emerald-400">{formatCOP(simResult.dailyInterestPortion)}/día</span>
                </div>
                <div className="border-t border-slate-700/60 pt-2 flex justify-between items-center text-xs">
                  <span className="text-slate-300">Total Deuda a Cobrar:</span>
                  <span className="font-bold text-emerald-300 font-mono">{formatCOP(simResult.totalDebt)}</span>
                </div>
                <div className="bg-rose-950/30 border border-rose-900/40 rounded-lg p-2 mt-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-rose-300 font-medium">Colchón de Liquidez Obligatorio:</span>
                    <span className="font-bold text-rose-300 font-mono">{formatCOP(simResult.liquidityBufferRequired)}</span>
                  </div>
                  <span className="text-[10px] text-rose-400/80 block mt-0.5">
                    Reserva requerida para cubrir retrasos en calle sin quebrar el flujo de caja.
                  </span>
                </div>
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 mt-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">T.E.A. Implícita Anualizada:</span>
                    <span className="font-bold text-amber-300 font-mono">{simResult.implicitTEA.toFixed(0)}% E.A.</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Rendimiento bruto de rotación de capital antes de descontar OpEx de cobranza.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800">
            Regla CFO: Toda simulación descuenta gastos operativos del rutero antes de considerar la utilidad como ganancia distribuible.
          </div>
        </div>
      </div>

      {/* MODAL DE INTELIGENCIA DE RIESGO */}
      {showRiskModal && (
        <RiskIntelligenceModal
          clients={clients}
          loans={loans}
          routes={routes}
          ledger={ledger}
          onClose={() => setShowRiskModal(false)}
        />
      )}

      {/* MODAL DE ASIGNACIÓN DINÁMICA DE RUTAS */}
      {showReassignModal && (
        <DynamicRouteAssignment
          routes={routes}
          clients={clients}
          loans={loans}
          onReassignClientRoute={onReassignClientRoute}
          onClose={() => setShowReassignModal(false)}
        />
      )}

      {/* MODAL ASISTENTE IA DE NEGOCIACIÓN */}
      {showAiNegotiatorModal && (
        <AiNegotiationAssistantModal
          clients={clients}
          loans={loans}
          onApproveAgreement={handleApproveAiAgreement}
          onClose={() => setShowAiNegotiatorModal(false)}
        />
      )}

      {/* MODAL DE ARQUEO POR RUTA */}
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
