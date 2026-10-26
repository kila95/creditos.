import React, { useState } from 'react';
import { 
  Receipt, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Smartphone, 
  Banknote, 
  ChevronDown, 
  ChevronUp,
  Search
} from 'lucide-react';
import { LedgerEntry } from '../../data/mockData';
import { formatCOP } from '../../utils/financialCalculations';

interface ClientPaymentLedgerProps {
  ledgerEntries: LedgerEntry[];
  totalDebt: number;
}

export const ClientPaymentLedger: React.FC<ClientPaymentLedgerProps> = ({
  ledgerEntries,
  totalDebt
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
      {/* HEADER DE HISTORIAL */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm">Historial Oficial de Pagos (Ledger)</h3>
            <p className="text-[11px] text-slate-400">Registros certificados con sello digital inmutable</p>
          </div>
        </div>

        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
          {ledgerEntries.length} abonos
        </span>
      </div>

      {/* LISTA DE PAGOS / COMPROBANTES */}
      {ledgerEntries.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          Aún no se registran pagos en este período.
        </div>
      ) : (
        <div className="space-y-3">
          {ledgerEntries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const dateObj = new Date(entry.timestamp);
            const formattedDate = dateObj.toLocaleDateString('es-CO', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            });
            const formattedTime = dateObj.toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <div
                key={entry.id}
                className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 transition-all hover:border-slate-700 space-y-3"
              >
                {/* FILA PRINCIPAL DEL PAGO */}
                <div 
                  onClick={() => toggleExpand(entry.id)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      {entry.paymentMethod === 'efectivo' ? (
                        <Banknote className="w-5 h-5" />
                      ) : (
                        <Smartphone className="w-5 h-5" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-sm">
                          {formatCOP(entry.amount)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Pagado
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{formattedDate} a las {formattedTime}</span>
                        <span className="text-slate-600">•</span>
                        <span className="capitalize">{entry.paymentMethod}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] text-slate-500 block">Nuevo Saldo</span>
                      <span className="font-mono text-xs font-bold text-slate-300">
                        {formatCOP(entry.postBalance)}
                      </span>
                    </div>

                    <button className="text-slate-500 hover:text-white p-1">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* DETALLE EXPANDIBLE (DESGLOSE FINANCIERO & FIRMA) */}
                {isExpanded && (
                  <div className="pt-3 border-t border-slate-800/80 text-[11px] space-y-2.5 bg-slate-900/50 -mx-4 -mb-4 p-4 rounded-b-2xl">
                    <div className="grid grid-cols-2 gap-2 text-slate-300">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Folio Recibo:</span>
                        <span className="font-mono font-bold text-white">{entry.receiptNumber}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Saldo Anterior:</span>
                        <span className="font-mono">{formatCOP(entry.preBalance)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Abono a Capital:</span>
                        <span className="font-mono text-slate-200">{formatCOP(entry.principalPortion)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Interés Devengado:</span>
                        <span className="font-mono text-emerald-400">{formatCOP(entry.interestPortion)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                      <div className="flex items-center gap-1 text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Firma SHA-256 Verificada</span>
                      </div>
                      <span className="text-slate-500 truncate max-w-[160px]">
                        {entry.hash.substring(0, 16)}...
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
