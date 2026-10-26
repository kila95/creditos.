import React, { useState } from 'react';
import { 
  Coins, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  AlertCircle, 
  Receipt, 
  Calendar, 
  DollarSign,
  TrendingDown,
  ShieldCheck,
  Percent
} from 'lucide-react';
import { LoanDetail, ClientProfile } from '../data/mockData';
import { 
  formatCOP, 
  calculatePartialPaymentDistribution, 
  PartialPaymentDistribution 
} from '../utils/financialCalculations';

interface PartialPaymentModalProps {
  loan: LoanDetail;
  client?: ClientProfile;
  onConfirmPayment: (
    loanId: string, 
    amount: number, 
    distribution: PartialPaymentDistribution,
    notes: string,
    extensionDays?: number
  ) => void;
  onClose: () => void;
}

export const PartialPaymentModal: React.FC<PartialPaymentModalProps> = ({
  loan,
  client,
  onConfirmPayment,
  onClose
}) => {
  const fullInstallment = loan.installmentAmount;
  // Sugerir la mitad de la cuota por defecto
  const [partialAmount, setPartialAmount] = useState<number>(Math.round(fullInstallment / 2));
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'nequi' | 'daviplata'>('efectivo');
  const [collectorNotes, setCollectorNotes] = useState<string>('Abonó la mitad de la cuota hoy, promete el resto mañana.');
  const [hasExtension, setHasExtension] = useState<boolean>(false);
  const [extensionDays, setExtensionDays] = useState<number>(1);

  // Cálculo en tiempo real de la distribución financiera
  const distribution = calculatePartialPaymentDistribution(
    partialAmount,
    loan.installmentAmount,
    loan.principal,
    loan.totalDebt,
    loan.remainingBalance
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (partialAmount <= 0) return;

    onConfirmPayment(
      loan.id,
      partialAmount,
      distribution,
      collectorNotes,
      hasExtension ? extensionDays : undefined
    );
  };

  const handleSelectPreset = (fraction: number) => {
    const calculated = Math.round(fullInstallment * fraction);
    setPartialAmount(calculated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* ENCABEZADO */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-950/50">
              <Coins className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Abono Parcial & Prórroga
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{loan.code}</span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-white mt-0.5">
                {loan.clientName}
              </h3>
              <p className="text-xs text-slate-400">{loan.tradeName}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* CONTENIDO SCROLLABLE */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs">
          {/* CUOTA DIARIA COMPLETA VS MONTO ABONADO */}
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Cuota Completa del Día</span>
              <span className="text-lg sm:text-xl font-black text-slate-200 font-mono">
                {formatCOP(fullInstallment)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-amber-400 block">Saldo Pendiente Hoy</span>
              <span className="text-lg sm:text-xl font-black text-amber-300 font-mono">
                {formatCOP(distribution.unpaidInstallmentBalance)}
              </span>
            </div>
          </div>

          {/* INPUT PRINCIPAL DE ABONO CON BOTONES RÁPIDOS */}
          <div className="space-y-2">
            <label className="text-slate-200 font-bold block flex items-center justify-between">
              <span>Monto en Efectivo a Abonar (COP):</span>
              <span className="text-[10px] text-emerald-400 font-mono">Mínimo sugerido: {formatCOP(distribution.dailyInterestDue)}</span>
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-mono font-bold text-lg">
                $
              </div>
              <input
                type="number"
                min={1000}
                max={loan.remainingBalance}
                step={1000}
                required
                value={partialAmount}
                onChange={(e) => setPartialAmount(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl pl-9 pr-4 py-3 text-xl font-black text-white font-mono focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {/* PRESETS DE FRACCIÓN DE CUOTA (1/4, 1/2, 3/4) */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSelectPreset(0.25)}
                className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] transition-all border border-slate-700"
              >
                25% ({formatCOP(Math.round(fullInstallment * 0.25))})
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset(0.50)}
                className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] transition-all border border-slate-700"
              >
                50% ({formatCOP(Math.round(fullInstallment * 0.50))})
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset(0.75)}
                className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] transition-all border border-slate-700"
              >
                75% ({formatCOP(Math.round(fullInstallment * 0.75))})
              </button>
              <button
                type="button"
                onClick={() => setPartialAmount(fullInstallment)}
                className="py-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 font-bold text-[11px] transition-all border border-emerald-500/40"
              >
                100% Cuota
              </button>
            </div>
          </div>

          {/* DESGLOSE AUTOMÁTICO DE AMORTIZACIÓN (INTERÉS PRIMERO, SOBRANTE A CAPITAL) */}
          <div className="bg-slate-950/90 rounded-2xl p-4 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold border-b border-slate-800/80 pb-2">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                Motor Financiero de Liquidación Automática
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Regla CFO de Prelación</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1 text-amber-300 font-semibold">
                  <Percent className="w-3.5 h-3.5" />
                  1. Interés del Día Cubierto:
                </span>
                <span className="font-mono font-bold text-amber-300">
                  {formatCOP(distribution.interestPortionCovered)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <TrendingDown className="w-3.5 h-3.5" />
                  2. Amortización Directa a Capital:
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatCOP(distribution.principalPortionCovered)}
                </span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-800/80 text-white font-bold">
                <span>Nuevo Saldo Restante del Crédito:</span>
                <span className="font-mono text-emerald-300 text-sm">
                  {formatCOP(distribution.postBalance)}
                </span>
              </div>
            </div>

            {distribution.principalPortionCovered === 0 && partialAmount > 0 && (
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>El abono solo cubre los intereses devengados de hoy; el capital restante no disminuye.</span>
              </div>
            )}
          </div>

          {/* OPCIÓN DE PRÓRROGA DE PLAZO */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="extensionToggle" className="flex items-center gap-2 cursor-pointer">
                <input
                  id="extensionToggle"
                  type="checkbox"
                  checked={hasExtension}
                  onChange={(e) => setHasExtension(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 accent-emerald-500"
                />
                <span className="text-xs font-bold text-white flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  Otorgar Prórroga Formal de Plazo
                </span>
              </label>
              {hasExtension && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                  +{extensionDays} día(s)
                </span>
              )}
            </div>

            {hasExtension && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center gap-3">
                <span className="text-[11px] text-slate-400">Extender vencimiento en:</span>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 5].map((days) => (
                    <button
                      type="button"
                      key={days}
                      onClick={() => setExtensionDays(days)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        extensionDays === days
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {days} {days === 1 ? 'día' : 'días'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* NOTA OPERACIONAL DEL COBRADOR */}
          <div className="space-y-1">
            <label className="text-slate-300 font-bold block">
              Nota / Compromiso del Deudor (Obligatoria para auditoría):
            </label>
            <textarea
              required
              rows={2}
              value={collectorNotes}
              onChange={(e) => setCollectorNotes(e.target.value)}
              placeholder="Ej: Abonó $25.000, promete completar los otros $25.000 mañana a las 3:00 PM..."
              className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
            />
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-2xl font-black text-xs shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar Abono ({formatCOP(partialAmount)})</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
