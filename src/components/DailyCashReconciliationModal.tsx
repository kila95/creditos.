import React, { useState } from 'react';
import { 
  Calculator, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingDown, 
  ShieldCheck, 
  Coins, 
  FileCheck,
  Lock,
  Banknote,
  DollarSign,
  ArrowRight
} from 'lucide-react';
import { RouteData, RouteExpenseItem } from '../data/mockData';
import { formatCOP } from '../utils/financialCalculations';

export interface CashDrawerSessionRecord {
  id: string;
  routeId: string;
  collectorName: string;
  sessionDate: string;
  openingCash: number;
  cashCollected: number;
  cashDisbursed: number;
  routeExpenses: number;
  expectedClosingCash: number;
  actualClosingCash: number;
  discrepancy: number;
  status: 'cuadre_exacto' | 'sobrante' | 'faltante';
  denominations: Record<string, number>;
  notes: string;
  closedAt: string;
  adminApproved: boolean;
  hash: string;
}

interface DailyCashReconciliationModalProps {
  route: RouteData;
  expenses: RouteExpenseItem[];
  onConfirmReconciliation: (
    routeId: string, 
    actualCash: number, 
    discrepancy: number, 
    notes: string,
    sessionRecord?: CashDrawerSessionRecord
  ) => void;
  onClose: () => void;
}

const DENOMINATIONS = [
  { label: 'Billetes $100.000', value: 100000 },
  { label: 'Billetes $50.000', value: 50000 },
  { label: 'Billetes $20.000', value: 20000 },
  { label: 'Billetes $10.000', value: 10000 },
  { label: 'Billetes $5.000', value: 5000 },
  { label: 'Billetes $2.000', value: 2000 },
  { label: 'Monedas (Total)', value: 1000, isMultiplier: false }
];

export const DailyCashReconciliationModal: React.FC<DailyCashReconciliationModalProps> = ({
  route,
  expenses,
  onConfirmReconciliation,
  onClose
}) => {
  const routeExpenses = expenses.filter(e => e.routeId === route.id);
  const totalExpenses = routeExpenses.reduce((acc, e) => acc + e.amount, 0);

  // Ecuación financiera estricta:
  // Esperado = Base Flotante + Recaudo Efectivo - Desembolsos - Gastos
  const baseFloating = route.baseFloatingCapital;
  const cashCollected = route.dailyGrossCollected;
  const cashDisbursed = 0; // Desembolsos nuevos del día
  const expectedClosingCash = baseFloating + cashCollected - cashDisbursed - totalExpenses;

  const [activeTab, setActiveTab] = useState<'quick' | 'denominations'>('quick');

  // Estado del conteo físico del cobrador
  const [actualCashInput, setActualCashInput] = useState<number>(expectedClosingCash);
  const [notes, setNotes] = useState<string>('');
  const [isAudited, setIsAudited] = useState<boolean>(false);

  // Desglose por billetes
  const [billCounts, setBillCounts] = useState<Record<number, number>>({
    100000: Math.floor(expectedClosingCash / 100000),
    50000: Math.floor((expectedClosingCash % 100000) / 50000),
    20000: Math.floor(((expectedClosingCash % 100000) % 50000) / 20000),
    10000: Math.floor((((expectedClosingCash % 100000) % 50000) % 20000) / 10000),
    5000: 0,
    2000: 0,
    1000: ((expectedClosingCash % 100000) % 50000) % 10000 // Monedas
  });

  const calculateTotalFromDenominations = (counts: Record<number, number>) => {
    let total = 0;
    for (const [denomStr, count] of Object.entries(counts)) {
      const denom = Number(denomStr);
      if (denom === 1000) {
        total += count; // Monedas en valor directo
      } else {
        total += denom * count;
      }
    }
    return total;
  };

  const handleDenominationChange = (value: number, count: number) => {
    const nextCounts = { ...billCounts, [value]: Math.max(0, count) };
    setBillCounts(nextCounts);
    const newTotal = calculateTotalFromDenominations(nextCounts);
    setActualCashInput(newTotal);
  };

  const discrepancy = actualCashInput - expectedClosingCash;
  const isExact = discrepancy === 0;
  const isShortage = discrepancy < 0;
  const isSurplus = discrepancy > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const sessionRecord: CashDrawerSessionRecord = {
      id: `cds-${Date.now()}`,
      routeId: route.id,
      collectorName: route.collectorName,
      sessionDate: new Date().toISOString().split('T')[0],
      openingCash: baseFloating,
      cashCollected,
      cashDisbursed,
      routeExpenses: totalExpenses,
      expectedClosingCash,
      actualClosingCash: actualCashInput,
      discrepancy,
      status: isExact ? 'cuadre_exacto' : isSurplus ? 'sobrante' : 'faltante',
      denominations: billCounts,
      notes: notes || (isExact ? 'Cuadre perfecto de caja en sobre sellado.' : `Diferencia de ${formatCOP(discrepancy)} reportada.`),
      closedAt: new Date().toISOString(),
      adminApproved: false,
      hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };

    onConfirmReconciliation(route.id, actualCashInput, discrepancy, notes, sessionRecord);
    setIsAudited(true);
    setTimeout(() => {
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border-2 border-amber-500/40 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Arqueo de Turno · Cierre de Caja
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{route.code}</span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-white mt-0.5">
                {route.name}
              </h3>
              <p className="text-xs text-slate-400">Rutero: <strong className="text-slate-200">{route.collectorName}</strong></p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {isAudited ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center animate-bounce">
              <FileCheck className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-lg font-black text-white">¡Arqueo de Turno Sellado y Guardado!</h4>
              <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
                La sesión ha sido registrada en la tabla <code className="text-emerald-400 font-mono">cash_drawer_sessions</code> y queda lista para aprobación por el CFO.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs">
            {/* ECUACIÓN MATEMÁTICA DEL SISTEMA */}
            <div className="bg-slate-950/80 p-3.5 sm:p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>(+) Base Flotante Apertura:</span>
                <span className="font-mono text-slate-200">{formatCOP(baseFloating)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>(+) Recaudos en Efectivo del Día:</span>
                <span className="font-mono text-emerald-400 font-semibold">+{formatCOP(cashCollected)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>(-) Desembolsos Nuevos en Calle:</span>
                <span className="font-mono text-slate-400">-{formatCOP(cashDisbursed)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>(-) Gastos de Ruta Justificados (OpEx):</span>
                <span className="font-mono text-amber-400 font-semibold">-{formatCOP(totalExpenses)}</span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between text-slate-200 font-bold text-sm">
                <span>(=) Efectivo Físico Esperado en Sobre:</span>
                <span className="font-mono text-white text-base font-black">{formatCOP(expectedClosingCash)}</span>
              </div>
            </div>

            {/* PESTAÑAS: CONTEO RÁPIDO VS DESGLOSE DE BILLETES */}
            <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('quick')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'quick' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Conteo Total Rápido
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('denominations')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'denominations' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                Desglose por Billetes
              </button>
            </div>

            {/* VISTA 1: INPUT DIRECTO */}
            {activeTab === 'quick' && (
              <div className="space-y-1.5">
                <label className="text-slate-200 font-bold block flex items-center justify-between">
                  <span>Efectivo Total en el Sobre (COP):</span>
                  <button
                    type="button"
                    onClick={() => setActualCashInput(expectedClosingCash)}
                    className="text-[10px] text-amber-400 hover:underline"
                  >
                    Usar Monto Esperado Exacto
                  </button>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-mono font-bold text-lg">
                    $
                  </div>
                  <input
                    type="number"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(Number(e.target.value))}
                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl pl-9 pr-4 py-3 text-xl font-black text-white font-mono focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>
            )}

            {/* VISTA 2: DESGLOSE POR DENOMINACIÓN */}
            {activeTab === 'denominations' && (
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-300 block mb-1">
                  Ingrese la cantidad de billetes contados:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {DENOMINATIONS.map((denom) => (
                    <div key={denom.value} className="bg-slate-900 p-2 rounded-xl border border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-300">{denom.label}</span>
                      <input
                        type="number"
                        min={0}
                        value={billCounts[denom.value] || 0}
                        onChange={(e) => handleDenominationChange(denom.value, Number(e.target.value))}
                        className="w-16 bg-slate-950 border border-slate-700 rounded-lg py-1 px-1.5 text-center text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs font-bold text-white">
                  <span>Suma de Billetes & Monedas:</span>
                  <span className="font-mono text-amber-400 text-sm">{formatCOP(actualCashInput)}</span>
                </div>
              </div>
            )}

            {/* ESTADO EN VIVO DEL ARQUEO: CUADRE, SOBRANTE O FALTANTE */}
            <div className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${
              isExact
                ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300'
                : isShortage
                ? 'bg-rose-950/40 border-rose-500 text-rose-300'
                : 'bg-blue-950/40 border-blue-500 text-blue-300'
            }`}>
              <div className="flex items-center gap-2.5">
                {isExact ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-7 h-7 shrink-0 text-amber-400" />
                )}
                <div>
                  <span className="font-black uppercase tracking-wider text-xs block">
                    {isExact ? '🟢 Cuadre Exacto (Sin Discrepancia)' : isShortage ? '🔴 Faltante de Caja Crítico' : '🟡 Sobrante de Caja'}
                  </span>
                  <span className="text-[11px] opacity-90 block mt-0.5">
                    {isExact
                      ? 'El dinero en mano coincide exactamente con los cobros y gastos reportados.'
                      : isShortage
                      ? 'Déficit de dinero físico. Se registrará un cargo provisional a la fianza del cobrador.'
                      : 'Efectivo recibido supera lo reportado. Requiere verificación de posibles abonos sin registrar.'}
                  </span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] block opacity-80 uppercase font-mono font-bold">Diferencia</span>
                <span className="font-mono text-lg font-black">
                  {discrepancy > 0 ? `+${formatCOP(discrepancy)}` : formatCOP(discrepancy)}
                </span>
              </div>
            </div>

            {/* OBSERVACIONES DEL COBRADOR */}
            <div>
              <label className="text-slate-400 font-bold block mb-1">
                Observaciones del Arqueo / Justificación de la Entrega:
              </label>
              <textarea
                rows={2}
                placeholder="Ej: Entrega conforme en ventanilla en sobre sellado #042..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* BOTONES */}
            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black rounded-2xl shadow-xl shadow-amber-950/60 flex items-center justify-center gap-1.5 transition-all text-xs"
              >
                <Lock className="w-4 h-4" />
                Sellar y Guardar Sesión de Caja
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
