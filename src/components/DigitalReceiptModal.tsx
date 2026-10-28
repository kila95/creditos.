import React, { useState } from 'react';
import { 
  Receipt, 
  Send, 
  Copy, 
  Check, 
  ShieldCheck, 
  Share2, 
  Printer,
  Smartphone
} from 'lucide-react';
import { LedgerEntry, ClientProfile, LoanDetail } from '../data/mockData';
import { buildDigitalReceiptWhatsAppMessage } from '../utils/whatsappMessaging';
import { formatCOP } from '../utils/financialCalculations';
import { BluetoothPrintManager } from './BluetoothPrintManager';

interface DigitalReceiptModalProps {
  entry: LedgerEntry;
  client: ClientProfile;
  loan: LoanDetail;
  onClose: () => void;
}

export const DigitalReceiptModal: React.FC<DigitalReceiptModalProps> = ({
  entry,
  client,
  loan,
  onClose
}) => {
  const [copied, setCopied] = useState(false);
  const wa = buildDigitalReceiptWhatsAppMessage(entry, client, loan);

  const handleCopyText = () => {
    navigator.clipboard.writeText(wa.messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    window.open(wa.whatsappUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Comprobante Oficial de Recaudo</h3>
              <p className="text-[10px] text-slate-400 font-mono">Folio #{entry.receiptNumber}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>

        {/* CONTENIDO DEL RECIBO FÍSICO/DIGITAL */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* TICKET CARD ESTILO RECIBO TÉRMICO DIGITAL */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3 font-mono relative">
            <div className="text-center pb-3 border-b border-dashed border-slate-800">
              <div className="text-base font-black text-white tracking-wider uppercase">RutaCapital OS</div>
              <div className="text-[10px] text-emerald-400 font-bold">SISTEMA DE MICROFINANZAS URBANAS</div>
              <div className="text-[10px] text-slate-500">Medellín, Antioquia • Recaudo Certificado</div>
            </div>

            <div className="space-y-1 text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Fecha/Hora:</span>
                <span>{new Date(entry.timestamp).toLocaleString('es-CO')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cliente:</span>
                <span className="font-bold text-white truncate max-w-[200px]">{client.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Negocio:</span>
                <span className="text-slate-200">{client.tradeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ubicación GPS:</span>
                <span className="text-[10px] text-slate-400">{entry.gpsLocation}</span>
              </div>
            </div>

            <div className="py-2.5 border-y border-dashed border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Monto Total Recibido</span>
              <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                {formatCOP(entry.amount)}
              </span>
              <span className="text-[10px] text-emerald-300 font-bold uppercase block mt-0.5">
                Medio: {entry.paymentMethod}
              </span>
            </div>

            <div className="space-y-1 text-[11px] text-slate-400">
              <div className="flex justify-between">
                <span>Amortización a Capital:</span>
                <span className="text-slate-200">{formatCOP(entry.principalPortion)}</span>
              </div>
              <div className="flex justify-between">
                <span>Interés Devengado:</span>
                <span className="text-slate-200">{formatCOP(entry.interestPortion)}</span>
              </div>
              <div className="flex justify-between text-slate-300 font-bold pt-1 border-t border-slate-800/80">
                <span>Saldo Anterior:</span>
                <span>{formatCOP(entry.preBalance)}</span>
              </div>
              <div className="flex justify-between text-white font-extrabold text-xs">
                <span>NUEVO SALDO PENDIENTE:</span>
                <span className="text-emerald-400">{formatCOP(entry.postBalance)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-dashed border-slate-800 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-emerald-400 font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Huella SHA-256 Inmutable</span>
              </div>
              <span className="text-[9px] text-slate-600 block break-all font-mono mt-0.5">
                {entry.hash}
              </span>
            </div>
          </div>
        </div>

        {/* ACCIONES DE IMPRESIÓN TÉRMICA BLUETOOTH Y WHATSAPP */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 space-y-2.5">
          <BluetoothPrintManager
            compact={true}
            receiptData={{
              organizationName: 'ENRUTA MICROCREDITO',
              receiptNumber: entry.receiptNumber,
              clientName: client.name,
              clientDocument: client.id,
              routeName: client.routeId,
              amountPaid: entry.amount,
              previousBalance: entry.preBalance,
              newBalance: entry.postBalance,
              paymentDate: new Date(entry.timestamp).toLocaleString('es-CO'),
              notes: `Medio: ${entry.paymentMethod.toUpperCase()}`,
            }}
          />

          <button
            onClick={handleOpenWhatsApp}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-2xl font-bold text-xs shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 transition-all"
          >
            <Send className="w-4 h-4" />
            Enviar Recibo al WhatsApp del Cliente ({client.phone})
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleCopyText}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? '¡Copiado!' : 'Copiar Texto'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-400 rounded-xl font-semibold text-xs"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
