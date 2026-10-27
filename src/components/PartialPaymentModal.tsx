import React, { useState } from 'react';
import {
  Coins,
  CheckCircle2,
  AlertCircle,
  Calendar,
  TrendingDown,
  ShieldCheck,
  Percent,
  X,
} from 'lucide-react';
import { LoanDetail, ClientProfile } from '../data/mockData';
import {
  formatCOP,
  roundCOP,
  validatePaymentAmount,
  calculatePartialPaymentDistribution,
  PartialPaymentDistribution,
} from '../utils/financialCalculations';

interface PartialPaymentModalProps {
  loan: LoanDetail;
  client?: ClientProfile;
  onConfirmPayment: (
    loanId: string,
    amount: number,
    distribution: PartialPaymentDistribution,
    notes: string,
    extensionDays?: number,
    paymentMethod?: 'efectivo' | 'nequi' | 'bancolombia' | 'daviplata' | 'transferencia'
  ) => void;
  onClose: () => void;
}

export const PartialPaymentModal: React.FC<PartialPaymentModalProps> = ({
  loan,
  onConfirmPayment,
  onClose,
}) => {
  const maxAllowedBalance = Math.max(0, roundCOP(loan.remainingBalance));
  const fullInstallment = Math.min(roundCOP(loan.installmentAmount), maxAllowedBalance);
  const defaultSuggested = Math.min(roundCOP(loan.installmentAmount / 2), maxAllowedBalance);

  const [partialAmountInput, setPartialAmountInput] = useState<string>(String(defaultSuggested));
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'nequi' | 'bancolombia' | 'daviplata' | 'transferencia'>('efectivo');
  const [collectorNotes, setCollectorNotes] = useState<string>(
    'Abonó cuota parcial, compromiso de pago por saldo restante.'
  );
  const [hasExtension, setHasExtension] = useState<boolean>(false);
  const [extensionDays, setExtensionDays] = useState<number>(1);
  const [validationError, setValidationError] = useState<string | null>(null);

  const partialAmount = roundCOP(partialAmountInput);
  const paymentCheck = validatePaymentAmount(partialAmount, maxAllowedBalance);

  // Cálculo en tiempo real de la distribución financiera en enteros COP
  const distribution = calculatePartialPaymentDistribution(
    partialAmount,
    loan.installmentAmount,
    loan.principal,
    loan.totalDebt,
    maxAllowedBalance
  );

  const handleAmountChange = (rawVal: string) => {
    setPartialAmountInput(rawVal);
    const numericVal = roundCOP(rawVal);
    const check = validatePaymentAmount(numericVal, maxAllowedBalance);
    setValidationError(check.isValid ? null : check.errorMessage);
  };

  const handleSelectPreset = (targetAmount: number) => {
    const clamped = Math.min(roundCOP(targetAmount), maxAllowedBalance);
    setPartialAmountInput(String(clamped));
    setValidationError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCheck.isValid) {
      setValidationError(paymentCheck.errorMessage);
      return;
    }

    onConfirmPayment(
      loan.id,
      paymentCheck.sanitizedAmount,
      distribution,
      collectorNotes,
      hasExtension ? extensionDays : undefined,
      paymentMethod
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* ENCABEZADO */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Registrar Abono o Pago</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-300">{loan.code}</span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">{loan.clientName}</h3>
              <p className="text-xs text-slate-400">{loan.tradeName}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENIDO SCROLLABLE */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs">
          {/* CUOTA PACTADA VS SALDO TOTAL PENDIENTE DEL CLIENTE */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[11px] text-slate-400 block">Cuota Pactada</span>
              <span className="text-lg font-bold text-slate-100 font-mono tabular-nums">
                {formatCOP(loan.installmentAmount)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-indigo-300 font-medium block">
                Saldo Pendiente Actual (Máximo)
              </span>
              <span className="text-lg font-bold text-emerald-400 font-mono tabular-nums">
                {formatCOP(maxAllowedBalance)}
              </span>
            </div>
          </div>

          {/* ALERTA DE VALIDACIÓN SI EL PAGO SUPERA EL SALDO PENDIENTE */}
          {(!paymentCheck.isValid || validationError) && (
            <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 space-y-2">
              <div className="flex items-start gap-2 font-semibold text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{validationError || paymentCheck.errorMessage}</span>
              </div>
              {partialAmount > maxAllowedBalance && (
                <button
                  type="button"
                  onClick={() => handleSelectPreset(maxAllowedBalance)}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Ajustar al Saldo Pendiente Exacto ({formatCOP(maxAllowedBalance)})
                </button>
              )}
            </div>
          )}

          {/* INPUT PRINCIPAL DE ABONO EN ENTEROS COP CON BOTONES TÁCTILES */}
          <div className="space-y-2">
            <label className="text-slate-200 font-semibold flex items-center justify-between">
              <span>Monto a Recibir (Pesos Colombianos - COP):</span>
              <span className="text-[11px] text-emerald-400 font-mono tabular-nums">
                Entero exacto: {formatCOP(partialAmount)}
              </span>
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-400 font-mono font-bold text-base">
                $
              </div>
              <input
                type="number"
                min={1}
                max={maxAllowedBalance}
                step={1}
                required
                value={partialAmountInput}
                onChange={(e) => handleAmountChange(e.target.value)}
                className={`w-full bg-slate-950 border rounded-xl pl-9 pr-4 py-3 text-lg font-bold text-white font-mono tabular-nums focus:outline-none ${
                  !paymentCheck.isValid
                    ? 'border-rose-500 focus:border-rose-400'
                    : 'border-slate-700 focus:border-emerald-500'
                }`}
              />
            </div>

            {/* PRESETS RÁPIDOS TÁCTILES PARA CALLE */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSelectPreset(roundCOP(loan.installmentAmount * 0.5))}
                className="py-2.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors border border-slate-700 cursor-pointer font-mono tabular-nums"
              >
                50% ({formatCOP(Math.min(roundCOP(loan.installmentAmount * 0.5), maxAllowedBalance))})
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset(fullInstallment)}
                className="py-2.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors border border-slate-700 cursor-pointer font-mono tabular-nums"
              >
                1 Cuota ({formatCOP(fullInstallment)})
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset(roundCOP(loan.installmentAmount * 2))}
                className="py-2.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors border border-slate-700 cursor-pointer font-mono tabular-nums"
              >
                2 Cuotas ({formatCOP(Math.min(roundCOP(loan.installmentAmount * 2), maxAllowedBalance))})
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSelectPreset(maxAllowedBalance);
                  setCollectorNotes('Liquidación total de deuda (Saldo $0 COP)');
                }}
                className="py-2.5 px-2 rounded-lg bg-teal-950/90 hover:bg-teal-900/90 text-teal-200 font-bold text-xs transition-colors border border-teal-500/50 cursor-pointer font-mono tabular-nums shadow-sm"
              >
                Liquidar Saldo Total
              </button>
            </div>
          </div>

          {/* DESGLOSE AUTOMÁTICO DE AMORTIZACIÓN EN ENTEROS COP */}
          <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                Distribución del Pago (Enteros COP)
              </span>
              <span className="text-[11px] text-slate-400 font-mono">Prelación Interés / Capital</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5 text-amber-300 font-medium">
                  <Percent className="w-3.5 h-3.5" />
                  Interés Cubierto:
                </span>
                <span className="font-mono font-bold text-amber-300 tabular-nums">
                  {formatCOP(distribution.interestPortionCovered)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Abono Directo a Capital:
                </span>
                <span className="font-mono font-bold text-emerald-400 tabular-nums">
                  {formatCOP(distribution.principalPortionCovered)}
                </span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-white font-bold">
                <span>Nuevo Saldo Pendiente del Cliente:</span>
                <span className={`font-mono text-sm tabular-nums ${distribution.postBalance <= 0 ? 'text-teal-300 font-black' : 'text-emerald-400'}`}>
                  {formatCOP(distribution.postBalance)} {distribution.postBalance <= 0 ? '(Liquidado $0 COP)' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* OPCIÓN DE PRÓRROGA DE PLAZO */}
          <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="extensionToggle" className="flex items-center gap-2 cursor-pointer">
                <input
                  id="extensionToggle"
                  type="checkbox"
                  checked={hasExtension}
                  onChange={(e) => setHasExtension(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 accent-emerald-500"
                />
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  Otorgar Prórroga de Plazo
                </span>
              </label>
              {hasExtension && (
                <span className="text-xs font-mono font-semibold text-amber-300">
                  +{extensionDays} {extensionDays === 1 ? 'día' : 'días'}
                </span>
              )}
            </div>

            {hasExtension && (
              <div className="pt-2 border-t border-slate-800 flex items-center gap-3">
                <span className="text-xs text-slate-400">Extender en:</span>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 5].map((days) => (
                    <button
                      type="button"
                      key={days}
                      onClick={() => setExtensionDays(days)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        extensionDays === days
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* NOTA OPERACIONAL DEL COBRADOR */}
          <div className="space-y-1">
            <label className="text-slate-300 font-semibold block">
              Nota u Observación de Cobro:
            </label>
            <textarea
              required
              rows={2}
              value={collectorNotes}
              onChange={(e) => setCollectorNotes(e.target.value)}
              placeholder="Ej: Abonó en efectivo, resto programado para próxima visita..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* BOTONES DE ACCIÓN TÁCTILES */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[46px] py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!paymentCheck.isValid}
              className={`flex-1 min-h-[46px] py-3 text-white rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                partialAmount >= maxAllowedBalance
                  ? 'bg-teal-600 hover:bg-teal-500'
                  : 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {partialAmount >= maxAllowedBalance
                  ? `LIQUIDAR DEUDA TOTAL (${formatCOP(maxAllowedBalance)})`
                  : `Confirmar Pago (${formatCOP(partialAmount)})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

