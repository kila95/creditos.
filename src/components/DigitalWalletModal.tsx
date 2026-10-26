import React, { useState } from 'react';
import { 
  Wallet, 
  QrCode, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Check, 
  Smartphone, 
  CreditCard, 
  ShieldCheck, 
  ExternalLink,
  Zap,
  Building
} from 'lucide-react';
import { ClientProfile, LoanDetail } from '../data/mockData';
import { formatCOP } from '../utils/financialCalculations';

interface DigitalWalletModalProps {
  client: ClientProfile;
  loan?: LoanDetail;
  onApplyWalletToLoan: (amount: number) => void;
  onInstantDisbursement: (amount: number, channel: 'nequi' | 'daviplata', phone: string) => void;
  onClose: () => void;
}

export const DigitalWalletModal: React.FC<DigitalWalletModalProps> = ({
  client,
  loan,
  onApplyWalletToLoan,
  onInstantDisbursement,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'qr_pay' | 'wallet_balance' | 'instant_disburse'>('qr_pay');
  const [selectedGateway, setSelectedGateway] = useState<'bancolombia' | 'nequi' | 'daviplata'>('nequi');
  const [clientWalletBalance, setClientWalletBalance] = useState<number>(180000); // $180,000 COP a favor
  const [webhookSimulated, setWebhookSimulated] = useState<boolean>(false);
  const [disburseAmount, setDisburseAmount] = useState<number>(500000);
  const [disburseSuccess, setDisburseSuccess] = useState<boolean>(false);

  const handleSimulateWebhookPayment = () => {
    setWebhookSimulated(true);
    setTimeout(() => {
      if (loan) {
        onApplyWalletToLoan(loan.installmentAmount);
      }
      setWebhookSimulated(false);
    }, 1500);
  };

  const handleDisburseToPhone = () => {
    onInstantDisbursement(disburseAmount, 'nequi', client.phone);
    setDisburseSuccess(true);
    setTimeout(() => {
      setDisburseSuccess(false);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Billetera Digital & Pasarelas QR</h3>
              <p className="text-[11px] text-slate-400">{client.tradeName} • {client.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>

        {/* SELECTOR DE PESTAÑAS */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-5 pt-2 text-xs">
          <button
            onClick={() => setActiveTab('qr_pay')}
            className={`py-2 px-4 font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'qr_pay'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-4 h-4" />
            1. Pagar con QR Dinámico
          </button>

          <button
            onClick={() => setActiveTab('wallet_balance')}
            className={`py-2 px-4 font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'wallet_balance'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            2. Saldo a Favor ({formatCOP(clientWalletBalance)})
          </button>

          <button
            onClick={() => setActiveTab('instant_disburse')}
            className={`py-2 px-4 font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'instant_disburse'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            3. Desembolso a Nequi
          </button>
        </div>

        {/* CONTENIDO DE PESTAÑAS */}
        <div className="p-6 text-xs space-y-4">
          {/* TAB 1: CÓDIGOS QR LOCALES (BANCOLOMBIA / NEQUI / DAVIPLATA) */}
          {activeTab === 'qr_pay' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center gap-2">
                {[
                  { id: 'nequi', name: 'Nequi', color: 'bg-purple-600/20 text-purple-300 border-purple-500/40' },
                  { id: 'daviplata', name: 'Daviplata', color: 'bg-rose-600/20 text-rose-300 border-rose-500/40' },
                  { id: 'bancolombia', name: 'Bancolombia A la Mano', color: 'bg-amber-600/20 text-amber-300 border-amber-500/40' }
                ].map((gw) => (
                  <button
                    key={gw.id}
                    onClick={() => setSelectedGateway(gw.id as any)}
                    className={`px-3 py-1.5 rounded-xl border font-bold text-xs transition-all ${
                      selectedGateway === gw.id
                        ? `${gw.color} ring-2 ring-emerald-500/50`
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {gw.name}
                  </button>
                ))}
              </div>

              {/* QR CODE DISPLAY SIMULADO CON DATOS REALES */}
              <div className="bg-white p-5 rounded-2xl w-48 h-48 mx-auto flex flex-col items-center justify-center shadow-lg relative border-4 border-slate-700">
                <QrCode className="w-32 h-32 text-slate-900" />
                <span className="text-[9px] font-black font-mono text-slate-900 uppercase mt-1">
                  {selectedGateway} • {loan ? formatCOP(loan.installmentAmount) : '$50.000'}
                </span>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 max-w-sm mx-auto text-left text-[11px] space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>Valor de la Cuota:</span>
                  <span className="font-bold text-white font-mono">{loan ? formatCOP(loan.installmentAmount) : '$50.000'}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Referencia de Pago:</span>
                  <span className="font-mono text-emerald-400">RC-{client.document?.slice(-6) || '713924'}</span>
                </div>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Webhook de conciliación bancaria instantánea activado</span>
                </div>
              </div>

              {/* SIMULADOR DE WEBHOOK BANCARIO */}
              <button
                disabled={webhookSimulated}
                onClick={handleSimulateWebhookPayment}
                className="w-full max-w-sm mx-auto py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition-all"
              >
                {webhookSimulated ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Recibiendo Webhook de {selectedGateway.toUpperCase()}...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Simular Pago del Cliente por {selectedGateway.toUpperCase()}
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2: BILLETERA INTERNA CON SALDO A FAVOR */}
          {activeTab === 'wallet_balance' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/30 p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block">
                    Saldo a Favor en Billetera
                  </span>
                  <span className="text-3xl font-black text-white font-mono mt-1 block">
                    {formatCOP(clientWalletBalance)}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    Disponible para auto-débito de cuotas futuras
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Wallet className="w-6 h-6" />
                </div>
              </div>

              {loan && (
                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Cuota pendiente de hoy:</span>
                    <span className="font-bold text-white font-mono">{formatCOP(loan.installmentAmount)}</span>
                  </div>

                  <button
                    disabled={clientWalletBalance < loan.installmentAmount}
                    onClick={() => {
                      setClientWalletBalance(prev => prev - loan.installmentAmount);
                      onApplyWalletToLoan(loan.installmentAmount);
                    }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    Debitar Cuota de Hoy desde la Billetera
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DESEMBOLSO INSTANTÁNEO DIRECTO A NEQUI / DAVIPLATA */}
          {activeTab === 'instant_disburse' && (
            <div className="space-y-4">
              <div className="bg-amber-950/20 border border-amber-500/40 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Zap className="w-4 h-4" />
                    Dispersión Instantánea a Cuenta Móvil (API Pay)
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Transfiere capital aprobado directo al Nequi del cliente sin que el cobrador lleve efectivo.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Número de Cuenta Nequi / Daviplata:
                  </label>
                  <input
                    type="text"
                    value={client.phone}
                    disabled
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Monto a Desembolsar (COP):
                  </label>
                  <input
                    type="number"
                    value={disburseAmount}
                    onChange={(e) => setDisburseAmount(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-base font-bold text-emerald-400 font-mono"
                  />
                </div>

                {disburseSuccess ? (
                  <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-center font-bold">
                    ¡Fondos transferidos con éxito a {client.phone}!
                  </div>
                ) : (
                  <button
                    onClick={handleDisburseToPhone}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-950 flex items-center justify-center gap-2 transition-all"
                  >
                    <Smartphone className="w-4 h-4" />
                    Enviar {formatCOP(disburseAmount)} a Nequi de {client.name}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
