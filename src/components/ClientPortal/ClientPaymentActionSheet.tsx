import React, { useState } from 'react';
import { 
  Copy, 
  Check, 
  Smartphone, 
  MessageSquare, 
  QrCode, 
  ExternalLink,
  ShieldCheck,
  Send,
  HelpCircle
} from 'lucide-react';
import { ClientProfile, LoanDetail } from '../../data/mockData';
import { formatCOP } from '../../utils/financialCalculations';

interface ClientPaymentActionSheetProps {
  client: ClientProfile;
  loan: LoanDetail;
  onOpenQrModal: () => void;
}

export const ClientPaymentActionSheet: React.FC<ClientPaymentActionSheetProps> = ({
  client,
  loan,
  onOpenQrModal
}) => {
  const [copiedAccount, setCopiedAccount] = useState<'nequi' | 'daviplata' | null>(null);

  // Cuentas corporativas oficiales de recaudo para Medellín
  const NEQUI_NUMBER = '3128492011';
  const DAVIPLATA_NUMBER = '3128492011';
  const COLLECTOR_WHATSAPP = '573128492011';

  const handleCopyNequi = () => {
    navigator.clipboard.writeText(NEQUI_NUMBER);
    setCopiedAccount('nequi');
    setTimeout(() => setCopiedAccount(null), 2000);
  };

  const handleCopyDaviplata = () => {
    navigator.clipboard.writeText(DAVIPLATA_NUMBER);
    setCopiedAccount('daviplata');
    setTimeout(() => setCopiedAccount(null), 2000);
  };

  const handleOpenWhatsAppSupport = () => {
    const text = encodeURIComponent(
      `Hola, soy *${client.name}* del negocio *${client.tradeName}* (${client.neighborhood}). Tengo una consulta sobre mi cuota de hoy (${formatCOP(loan.installmentAmount)}) de mi crédito *${loan.code}*.`
    );
    window.open(`https://api.whatsapp.com/send?phone=${COLLECTOR_WHATSAPP}&text=${text}`, '_blank');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-bold text-white text-sm">Canales de Pago Directo & Soporte</h3>
          <p className="text-[11px] text-slate-400">Pague sin efectivo o contacte al cobrador asignado</p>
        </div>
      </div>

      {/* TARJETAS DE COPIA RÁPIDA DE CUENTAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* NEQUI */}
        <div className="bg-purple-950/30 border border-purple-500/30 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-purple-300 font-bold uppercase text-[10px]">
              <Smartphone className="w-3.5 h-3.5" />
              Nequi Oficial
            </div>
            <div className="text-base font-black text-white font-mono mt-1">
              {NEQUI_NUMBER}
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">RutaCapital Finanzas</span>
          </div>

          <button
            onClick={handleCopyNequi}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
              copiedAccount === 'nequi'
                ? 'bg-purple-500 text-white shadow-md shadow-purple-950'
                : 'bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/30'
            }`}
          >
            {copiedAccount === 'nequi' ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </>
            )}
          </button>
        </div>

        {/* DAVIPLATA */}
        <div className="bg-rose-950/30 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-rose-300 font-bold uppercase text-[10px]">
              <Smartphone className="w-3.5 h-3.5" />
              Daviplata Oficial
            </div>
            <div className="text-base font-black text-white font-mono mt-1">
              {DAVIPLATA_NUMBER}
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">RutaCapital Finanzas</span>
          </div>

          <button
            onClick={handleCopyDaviplata}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
              copiedAccount === 'daviplata'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-950'
                : 'bg-rose-600/30 hover:bg-rose-600/40 text-rose-200 border border-rose-500/30'
            }`}
          >
            {copiedAccount === 'daviplata' ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </>
            )}
          </button>
        </div>
      </div>

      {/* ACCIONES PRINCIPALES: QR DINÁMICO & WHATSAPP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <button
          onClick={onOpenQrModal}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-2xl shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 text-xs transition-all"
        >
          <QrCode className="w-4 h-4" />
          Generar Código QR de Pago
        </button>

        <button
          onClick={handleOpenWhatsAppSupport}
          className="w-full py-3.5 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 font-bold rounded-2xl flex items-center justify-center gap-2 text-xs transition-all"
        >
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          Chat WhatsApp con Rutero Asignado
        </button>
      </div>
    </div>
  );
};
