import React, { useState } from 'react';
import {
  ShieldAlert,
  Scale,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Phone,
  MessageCircle,
  CheckCircle2,
  Lock,
  FileWarning,
  X,
  PlusCircle,
} from 'lucide-react';
import { formatCOP, roundCOP } from '../utils/financialCalculations';

export interface Par30AlertItem {
  id: string;
  loanId: string;
  loanCode: string;
  clientId: string;
  clientName: string;
  tradeName: string;
  phone?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  routeId: string;
  daysOverdue: number;
  remainingBalance: number;
  installmentAmount: number;
  termDays: number;
  status: 'activo' | 'liquidado' | 'liquidated' | 'completed' | 'mora_severa' | 'refinanciado';
  legalDispatched?: boolean;
}

interface Par30AlertBannerProps {
  activeAlerts: Par30AlertItem[];
  onRestructureLoan: (loanId: string, newTermDays?: number, newInstallmentAmount?: number) => void;
  onInitiateLegalCollection: (alertItem: Par30AlertItem, legalNotes: string) => void;
  onSimulatePar30Case?: () => void;
}

export const Par30AlertBanner: React.FC<Par30AlertBannerProps> = ({
  activeAlerts,
  onRestructureLoan,
  onInitiateLegalCollection,
  onSimulatePar30Case,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [selectedLegalAlert, setSelectedLegalAlert] = useState<Par30AlertItem | null>(null);
  const [selectedRestructureAlert, setSelectedRestructureAlert] = useState<Par30AlertItem | null>(
    null
  );
  const [extraDays, setExtraDays] = useState<number>(20);
  const [legalNotes, setLegalNotes] = useState<string>(
    'Incumplimiento superior a 30 días (PAR 30). Se notifica inicio de cobro prejurídico y ejecución de garantía solidaria con fiador.'
  );
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const totalPar30Balance = activeAlerts.reduce(
    (sum, item) => sum + roundCOP(item.remainingBalance),
    0
  );

  const triggerToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast(null);
    }, 4000);
  };

  if (activeAlerts.length === 0) {
    return (
      <div className="mb-4 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-emerald-400 font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            Monitoreo PAR 30 Activo: 0 créditos con mora igual o superior a 30 días en este momento.
          </span>
        </div>
        {onSimulatePar30Case && (
          <button
            type="button"
            onClick={onSimulatePar30Case}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>Simular Caso PAR 30</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-5 space-y-2">
      {/* NOTIFICACIÓN FLOTANTE DE ACCIÓN EJECUTADA */}
      {feedbackToast && (
        <div className="bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedbackToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            className="text-emerald-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* BANNER PERSISTENTE SUPERIOR DE ALERTA PAR 30 */}
      <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500 text-white">
                  ALERTA CRÍTICA PAR 30
                </span>
                <span className="text-xs font-mono text-rose-300 tabular-nums">
                  {activeAlerts.length}{' '}
                  {activeAlerts.length === 1 ? 'crédito detectado' : 'créditos detectados'} con ≥ 30
                  días de mora
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
                Exposición en Riesgo PAR 30:{' '}
                <span className="font-mono text-rose-300 tabular-nums">
                  {formatCOP(totalPar30Balance)}
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Acción inmediata requerida por política de liquidez: ejecuta cobro prejurídico con
                fiador solidario o reestructura el plazo para normalizar la cartera.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onSimulatePar30Case && (
              <button
                type="button"
                onClick={onSimulatePar30Case}
                className="px-3 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Añadir un crédito de prueba con +30 días de mora para verificar el hook useEffect"
              >
                <PlusCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>+ Simular Mora 30d</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedLegalAlert(activeAlerts[0])}
              className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Cobro Legal Rápido</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRestructureAlert(activeAlerts[0]);
                setExtraDays(20);
              }}
              className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reestructurar</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-3 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>{isExpanded ? 'Ocultar' : 'Ver Detalle'}</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* LISTADO EXPANDIBLE DE CLIENTES EN PAR 30 CON ACCIONES RÁPIDAS */}
        {isExpanded && (
          <div className="border-t border-rose-500/30 bg-slate-950/75 px-4 py-3 sm:px-5 space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeAlerts.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900/95 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{item.clientName}</span>
                        <span className="text-[11px] font-mono text-slate-400">
                          ({item.loanCode})
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {item.tradeName} · Ruta: <span className="font-mono">{item.routeId}</span>
                      </p>
                      {item.guarantorName && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Fiador Solidario: <strong className="text-slate-300">{item.guarantorName}</strong>{' '}
                          {item.guarantorPhone ? `(${item.guarantorPhone})` : ''}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-700/60 text-xs font-mono font-bold tabular-nums">
                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                        {item.daysOverdue} días mora
                      </span>
                      <div className="text-sm font-bold font-mono text-white mt-1 tabular-nums">
                        {formatCOP(item.remainingBalance)}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                        Cuota: {formatCOP(item.installmentAmount)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-800/80">
                    <div className="flex items-center gap-1.5">
                      {item.legalDispatched ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-950/90 text-indigo-300 border border-indigo-700/50 text-[11px] font-semibold">
                          <Scale className="w-3 h-3" />
                          Cobro Prejurídico Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-950 text-slate-400 border border-slate-800 text-[11px]">
                          <Lock className="w-3 h-3 text-rose-400" />
                          Crédito Bloqueado
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedLegalAlert(item)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>Cobro Legal</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRestructureAlert(item);
                          setExtraDays(20);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reestructurar</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: GESTIÓN DE COBRO LEGAL / PREJURÍDICO */}
      {selectedLegalAlert && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Despacho de Cobro Prejurídico (PAR 30)
                  </h4>
                  <p className="text-xs text-slate-400">
                    {selectedLegalAlert.clientName} · {selectedLegalAlert.daysOverdue} días de mora
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLegalAlert(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Deudor Principal:</span>
                <span className="font-bold text-white">{selectedLegalAlert.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Comercio / Garantía:</span>
                <span className="text-slate-200">{selectedLegalAlert.tradeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fiador Solidario:</span>
                <span className="text-amber-300 font-medium">
                  {selectedLegalAlert.guarantorName || 'Registrado en pagaré'}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-2">
                <span className="text-slate-400">Saldo Exigible Inmediato:</span>
                <span className="font-mono font-bold text-rose-400 text-sm tabular-nums">
                  {formatCOP(selectedLegalAlert.remainingBalance)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="text-slate-300 font-semibold block">
                Dictamen y Acta de Cobro Prejurídico:
              </label>
              <textarea
                rows={3}
                value={legalNotes}
                onChange={(e) => setLegalNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              {selectedLegalAlert.phone && (
                <a
                  href={`https://wa.me/57${selectedLegalAlert.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `AVISO PREJURÍDICO RUTACAPITAL: Sr(a) ${selectedLegalAlert.clientName}, su crédito ${selectedLegalAlert.loanCode} registra ${selectedLegalAlert.daysOverdue} días de mora (PAR 30) con un saldo exigible de ${formatCOP(
                      selectedLegalAlert.remainingBalance
                    )}. Comuníquese hoy mismo para evitar ejecución de garantía con su fiador solidario.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Enviar Citación WhatsApp</span>
                </a>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setSelectedLegalAlert(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInitiateLegalCollection(selectedLegalAlert, legalNotes);
                    triggerToast(
                      `Expediente de cobro legal activado para ${selectedLegalAlert.clientName} (${selectedLegalAlert.loanCode}).`
                    );
                    setSelectedLegalAlert(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <FileWarning className="w-4 h-4" />
                  <span>Confirmar Cobro Legal</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: REESTRUCTURACIÓN RÁPIDA DE CRÉDITO PAR 30 */}
      {selectedRestructureAlert && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Reestructuración de Deuda PAR 30
                  </h4>
                  <p className="text-xs text-slate-400">{selectedRestructureAlert.clientName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRestructureAlert(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Saldo Pendiente a Reestructurar:</span>
                <span className="font-mono font-bold text-white tabular-nums">
                  {formatCOP(selectedRestructureAlert.remainingBalance)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cuota Actual:</span>
                <span className="font-mono text-slate-300 tabular-nums">
                  {formatCOP(selectedRestructureAlert.installmentAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Nuevo Plazo Propuesto:</span>
                <span className="font-mono text-emerald-400 font-bold tabular-nums">
                  { extraDays } cuotas diarias
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-2">
                <span className="text-slate-300 font-semibold">Nueva Cuota Diaria (COP):</span>
                <span className="font-mono font-bold text-emerald-400 text-sm tabular-nums">
                  {formatCOP(roundCOP(selectedRestructureAlert.remainingBalance / Math.max(1, extraDays)))}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="text-slate-300 font-semibold block">
                Seleccionar nuevo plazo de normalización:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[15, 20, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setExtraDays(days)}
                    className={`py-2 rounded-lg font-mono font-bold border transition-colors cursor-pointer ${
                      extraDays === days
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {days} Días
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedRestructureAlert(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const newQuota = roundCOP(
                    selectedRestructureAlert.remainingBalance / Math.max(1, extraDays)
                  );
                  onRestructureLoan(selectedRestructureAlert.loanId, extraDays, newQuota);
                  triggerToast(
                    `Crédito ${selectedRestructureAlert.loanCode} reestructurado a ${extraDays} cuotas de ${formatCOP(
                      newQuota
                    )}. Normalizado de PAR 30.`
                  );
                  setSelectedRestructureAlert(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
              >
                Aplicar Reestructuración
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
