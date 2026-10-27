import React, { useState } from 'react';
import { 
  BrainCircuit, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  TrendingDown, 
  CheckCircle2, 
  XCircle,
  Activity,
  Sliders,
  Sparkles
} from 'lucide-react';
import { ClientProfile, LoanDetail, RouteData, LedgerEntry } from '../data/mockData';
import { calculateClientCreditScore, detectRouteAnomalies, ClientScoreResult, RouteAnomaly } from '../utils/scoringEngine';
import { formatCOP } from '../utils/financialCalculations';

interface RiskIntelligenceProps {
  clients: ClientProfile[];
  loans: LoanDetail[];
  routes: RouteData[];
  ledger: LedgerEntry[];
  onClose: () => void;
  onSelectClientForLoan?: (clientId: string) => void;
}

export const RiskIntelligenceModal: React.FC<RiskIntelligenceProps> = ({
  clients = [],
  loans = [],
  routes = [],
  ledger = [],
  onClose
}) => {
  const safeClients = Array.isArray(clients) ? clients : [];
  const safeLoans = Array.isArray(loans) ? loans : [];
  const safeRoutes = Array.isArray(routes) ? routes : [];
  const safeLedger = Array.isArray(ledger) ? ledger : [];

  const [selectedClientId, setSelectedClientId] = useState<string>(
    safeClients[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<'scoring' | 'anomalies'>('scoring');

  const selectedClient = safeClients.find(c => c.id === selectedClientId) || safeClients[0] || null;
  const clientLoan = selectedClient ? safeLoans.find(l => l.clientId === selectedClient.id) : null;
  const clientLedger = selectedClient ? safeLedger.filter(e => e.clientId === selectedClient.id) : [];

  let scoreResult: ClientScoreResult | null = null;
  let calculationError: string | null = null;

  try {
    scoreResult = calculateClientCreditScore(selectedClient, clientLoan, clientLedger);
  } catch (err: any) {
    console.error('Error al calcular el scoring de riesgo:', err);
    calculationError = 'Ocurrió un error al procesar el scoring para este cliente.';
  }

  let anomalies: RouteAnomaly[] = [];
  try {
    anomalies = detectRouteAnomalies(safeRoutes, safeLoans, []);
  } catch (err: any) {
    console.error('Error al detectar anomalías en ruta:', err);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Inteligencia de Datos & Scoring Predictivo</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold">
                  ML RULES v2.4
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Calificación algorítmica de clientes y detector de anomalías en rutas de Medellín
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* TABS SELECTOR */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-5 pt-2 text-xs">
          <button
            onClick={() => setActiveTab('scoring')}
            className={`py-2 px-4 font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'scoring'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            1. Scoring de Clientes (Pre-Aprobación)
          </button>

          <button
            onClick={() => setActiveTab('anomalies')}
            className={`py-2 px-4 font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'anomalies'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            2. Anomalías y Caídas en Ruta ({anomalies.length})
          </button>
        </div>

        {/* CONTENIDO SCROLLABLE */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs flex-1">
          {activeTab === 'scoring' && (
            <div className="space-y-4">
              {safeClients.length === 0 ? (
                /* EMPTY STATE - NUEVO ADMINISTRADOR SIN CLIENTES */
                <div className="p-8 text-center bg-slate-800/30 border border-slate-800 rounded-2xl flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                    <BrainCircuit className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white">
                    Aún no hay datos de riesgo para este administrador
                  </h4>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                    Este administrador es nuevo y no registra clientes ni solicitudes de crédito en la base de datos.
                    Una vez que empiece a registrar operaciones, el motor predictivo generará los indicadores de score crediticio y límites recomendados.
                  </p>
                </div>
              ) : calculationError ? (
                /* ERROR FALLBACK */
                <div className="p-4 bg-rose-950/20 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{calculationError}</span>
                </div>
              ) : (
                <>
                  {/* SELECTOR DE CLIENTE */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                    <span className="text-slate-300 font-medium">Evaluar Cliente antes de nuevo desembolso:</span>
                    <select
                      value={selectedClientId || safeClients[0]?.id || ''}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="bg-slate-800 text-white font-semibold rounded-lg px-3 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      {safeClients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name || 'Cliente sin nombre'} — {c.tradeName || 'Micronegocio'} ({c.neighborhood || 'Medellín'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* CARD DE SCORE VISUAL */}
                  {scoreResult && (
                    <div className={`p-5 rounded-2xl border ${
                      scoreResult.riskLevel === 'VERDE'
                        ? 'bg-emerald-950/20 border-emerald-500/40'
                        : scoreResult.riskLevel === 'AMARILLO'
                        ? 'bg-amber-950/20 border-amber-500/40'
                        : 'bg-rose-950/20 border-rose-500/40'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                              scoreResult.riskLevel === 'VERDE'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : scoreResult.riskLevel === 'AMARILLO'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}>
                              Nivel de Riesgo: {scoreResult.riskLevel}
                            </span>
                            <span className="text-slate-400">• {selectedClient?.neighborhood || 'Zona Urbana'}</span>
                          </div>

                          <h4 className="text-lg font-black text-white mt-2">
                            {scoreResult.clientName}
                          </h4>
                          <p className="text-xs text-slate-300">
                            {scoreResult.tradeName} ({selectedClient?.category || 'Comercio'})
                          </p>
                        </div>

                        {/* SCORE BADGE */}
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block uppercase font-bold">Puntaje Crediticio</span>
                            <span className="text-3xl font-black text-white font-mono">
                              {scoreResult.score}<span className="text-base text-slate-500">/100</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* DETALLE DE FACTORES PREDICTIVOS */}
                      <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Puntualidad de Pago</span>
                          <span className="font-bold text-white text-xs">{scoreResult.factors.punctualityRate}%</span>
                          <span className="text-[10px] text-slate-500 block">cumplimiento</span>
                        </div>

                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Horario Habitual</span>
                          <span className="font-bold text-emerald-400 text-xs">
                            {scoreResult.factors.preferredPaymentWindow === 'matutino_temprano' ? 'Matutino (8-11am)' : 'Tarde'}
                          </span>
                          <span className="text-[10px] text-slate-500 block">mayor liquidez</span>
                        </div>

                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Prórrogas Solicitadas</span>
                          <span className={`font-bold text-xs ${scoreResult.factors.extensionRequestsCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                            {scoreResult.factors.extensionRequestsCount} veces
                          </span>
                          <span className="text-[10px] text-slate-500 block">días aplazados</span>
                        </div>

                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Cupo Máximo Aprobado</span>
                          <span className="font-bold text-emerald-300 text-xs font-mono">
                            {formatCOP(scoreResult.maxApprovedCreditLimit)}
                          </span>
                          <span className="text-[10px] text-slate-500 block">límite prudencial</span>
                        </div>
                      </div>

                      {/* RECOMENDACIÓN DE LA IA */}
                      <div className="mt-4 bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex items-start gap-2.5">
                        <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-purple-300 block text-xs">Recomendación para Aprobación:</span>
                          <p className="text-slate-300 text-xs mt-0.5 leading-relaxed">
                            {scoreResult.recommendation}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'anomalies' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Alertas Estadísticas de Ruta en Tiempo Real
                </span>
                <span className="text-[11px] text-slate-400">
                  Detección de desviaciones &gt; 25% y demoras en sincronización
                </span>
              </div>

              {anomalies.length === 0 ? (
                <div className="p-6 text-center bg-slate-800/30 border border-slate-800 rounded-xl text-slate-400 text-xs">
                  No se detectaron anomalías operativas en las rutas actualmente registradas.
                </div>
              ) : (
                anomalies.map(anomaly => (
                  <div
                    key={anomaly.id}
                    className={`p-4 rounded-xl border space-y-2 ${
                      anomaly.severity === 'critica'
                        ? 'bg-rose-950/20 border-rose-800/60'
                        : 'bg-amber-950/20 border-amber-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          anomaly.severity === 'critica' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {anomaly.type ? anomaly.type.replace(/_/g, ' ') : 'ANOMALIA'}
                        </span>
                        <span className="font-bold text-white text-xs">{anomaly.routeName} ({anomaly.routeCode})</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        Rutero: {anomaly.collectorName}
                      </span>
                    </div>

                    <p className="text-slate-300 text-xs leading-relaxed">
                      {anomaly.message}
                    </p>

                    <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                      <span>Observado: <strong className="text-white">{anomaly.metricObserved}</strong></span>
                      <span>Meta: <strong className="text-slate-300">{anomaly.metricBenchmark}</strong></span>
                      <span>Desviación: <strong className="text-rose-400 font-mono">-{anomaly.differencePercent}%</strong></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs transition-colors"
          >
            Cerrar Panel
          </button>
        </div>
      </div>
    </div>
  );
};

