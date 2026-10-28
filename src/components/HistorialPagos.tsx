import React, { useState, useEffect, useCallback } from 'react';
import {
  Receipt,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface PaymentReceipt {
  id: string;
  tenant_id: string;
  amount: number;
  reference: string;
  wompi_transaction_id: string;
  status: string;
  created_at: string;
}

export interface HistorialPagosProps {
  tenantId?: string;
}

export const HistorialPagos: React.FC<HistorialPagosProps> = ({ tenantId }) => {
  const { profile } = useAuth();
  const effectiveTenantId = tenantId || profile?.organizationId;

  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchPaymentReceipts = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      let query = supabase
        .from('payment_receipts')
        .select('id, tenant_id, amount, reference, wompi_transaction_id, status, created_at')
        .order('created_at', { ascending: false });

      if (effectiveTenantId) {
        query = query.eq('tenant_id', effectiveTenantId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      setReceipts((data as PaymentReceipt[]) || []);
    } catch (err: any) {
      console.error('[HistorialPagos] Error consultando payment_receipts:', err);
      setErrorMessage(
        err?.message || 'No se pudo cargar el historial de comprobantes desde la base de datos.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    fetchPaymentReceipts();
  }, [fetchPaymentReceipts]);

  const formatCurrencyCOP = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));
  };

  const formatDateCO = (isoDate: string) => {
    if (!isoDate) return '—';
    return new Date(isoDate).toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderStatusBadge = (status: string) => {
    const normalized = (status || '').toUpperCase();
    if (normalized === 'APPROVED' || normalized === 'ACTIVE' || normalized === 'PAID') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/30 uppercase">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          APROBADO
        </span>
      );
    }
    if (normalized === 'PENDING') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-950/70 text-amber-300 border border-amber-500/30 uppercase">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          PENDIENTE
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-950/70 text-rose-300 border border-rose-500/30 uppercase">
        <XCircle className="w-3.5 h-3.5 text-rose-400" />
        {normalized || 'RECHAZADO'}
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Historial de Pagos y Comprobantes SaaS
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                RLS Activo
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Registro inmutable de facturación mensual procesado vía Webhook criptográfico de Wompi Bancolombia.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchPaymentReceipts}
          disabled={isLoading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Actualizar Comprobantes</span>
        </button>
      </div>

      {/* Alerta de error si ocurre */}
      {errorMessage && (
        <div className="flex items-start gap-2.5 bg-rose-950/50 border border-rose-800/70 text-rose-200 px-4 py-3 rounded-xl text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Aviso al consultar comprobantes</p>
            <p className="text-rose-300/90 mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Tabla de Comprobantes */}
      <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/60">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
              <th className="py-3.5 px-4">Fecha de Pago</th>
              <th className="py-3.5 px-4">Referencia</th>
              <th className="py-3.5 px-4">ID Transacción Wompi</th>
              <th className="py-3.5 px-4">Monto Pagado</th>
              <th className="py-3.5 px-4 text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                    <span>Consultando comprobantes en `payment_receipts`...</span>
                  </div>
                </td>
              </tr>
            ) : receipts.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                    <FileText className="w-7 h-7 text-slate-600" />
                    <p className="font-semibold text-slate-300">
                      No se encontraron comprobantes registrados
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Los pagos aprobados por Wompi aparecerán automáticamente aquí una vez procesado el webhook.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              receipts.map((receipt) => (
                <tr key={receipt.id} className="hover:bg-slate-900/70 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                    {formatDateCO(receipt.created_at)}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-200 font-semibold">
                    {receipt.reference}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-emerald-400">
                    {receipt.wompi_transaction_id}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-white tabular-nums">
                    {formatCurrencyCOP(receipt.amount)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {renderStatusBadge(receipt.status)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pie de auditoría */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Aislamiento Row Level Security (RLS): Solo lectura para el Administrador propietario del Tenant.
        </span>
        <span className="font-mono">Tabla: public.payment_receipts</span>
      </div>
    </div>
  );
};

export default HistorialPagos;
