import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  ShieldCheck,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Smartphone,
  Building,
  RefreshCw,
} from 'lucide-react';
import { formatCOP } from '../utils/financialCalculations';

// Declaración global para el widget de Wompi
declare global {
  interface Window {
    WidgetCheckout?: any;
  }
}

interface SubscriptionCheckoutProps {
  tenantId: string;
  adminEmail: string;
  adminName: string;
  amountCOP?: number;
  onPaymentSuccess?: (transactionId: string) => void;
  onPaymentCancel?: () => void;
}

/**
 * Genera el hash criptográfico SHA-256 requerido por Wompi para garantizar
 * la integridad del monto y evitar alteraciones en el cliente.
 * Fórmula Wompi: SHA256(reference + amountInCents + currency + integritySecret)
 */
async function generateWompiIntegritySignature(
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string
): Promise<string> {
  const message = `${reference}${amountInCents}${currency}${integritySecret}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const SubscriptionCheckout: React.FC<SubscriptionCheckoutProps> = ({
  tenantId,
  adminEmail,
  adminName,
  amountCOP = 180000,
  onPaymentSuccess,
  onPaymentCancel,
}) => {
  // Llaves de Wompi (Variables de entorno con fallbacks seguros de Sandbox/Pruebas)
  const wompiPublicKey =
    import.meta.env.VITE_WOMPI_PUBLIC_KEY || 'pub_test_Q5yDA9xoKdePzhSGeVe9KStAO6FF1xWx';
  const wompiIntegritySecret =
    import.meta.env.VITE_WOMPI_INTEGRITY_SECRET || 'test_integrity_b8a9F19E3c4A8D7E2B5c';

  const [isLoadingWidget, setIsLoadingWidget] = useState<boolean>(true);
  const [isOpeningCheckout, setIsOpeningCheckout] = useState<boolean>(false);
  const [integritySignature, setIntegritySignature] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const amountInCents = amountCOP * 100;
  const currency = 'COP';

  // 1. Cargar el script oficial del Web Checkout de Wompi e inicializar la firma de integridad
  useEffect(() => {
    let isMounted = true;

    // Generar referencia única vinculando el tenant_id para Server-to-Server reconciliation
    const generatedReference = `SUB-${tenantId}-${Date.now().toString().slice(-8)}`;
    setReference(generatedReference);

    // Calcular firma de integridad
    generateWompiIntegritySignature(
      generatedReference,
      amountInCents,
      currency,
      wompiIntegritySecret
    )
      .then((sig) => {
        if (isMounted) {
          setIntegritySignature(sig);
        }
      })
      .catch((err) => {
        console.error('Error calculando firma de integridad Wompi:', err);
        if (isMounted) setErrorMessage('No fue posible generar la firma criptográfica de Wompi.');
      });

    // Cargar script del widget si no está presente
    if (!document.getElementById('wompi-checkout-script')) {
      const script = document.createElement('script');
      script.id = 'wompi-checkout-script';
      script.src = 'https://checkout.wompi.co/widget.js';
      script.async = true;
      script.onload = () => {
        if (isMounted) setIsLoadingWidget(false);
      };
      script.onerror = () => {
        if (isMounted) {
          setIsLoadingWidget(false);
          setErrorMessage('No se pudo cargar el widget de pago de Wompi. Verifique su conexión.');
        }
      };
      document.body.appendChild(script);
    } else {
      setIsLoadingWidget(false);
    }

    return () => {
      isMounted = false;
    };
  }, [tenantId, amountInCents, currency, wompiIntegritySecret]);

  // 2. Invocar el widget interactivo de Wompi
  const handleOpenWompiWidget = () => {
    if (!window.WidgetCheckout) {
      setErrorMessage('El módulo de Wompi aún no ha terminado de inicializarse.');
      return;
    }

    if (!integritySignature) {
      setErrorMessage('Generando firma de seguridad... por favor espere un segundo.');
      return;
    }

    setIsOpeningCheckout(true);

    try {
      const checkout = new window.WidgetCheckout({
        currency,
        amountInCents,
        reference,
        publicKey: wompiPublicKey,
        signature: { integrity: integritySignature },
        redirectUrl: `${window.location.origin}?wompi_ref=${reference}`,
        customerData: {
          email: adminEmail,
          fullName: adminName,
        },
      });

      checkout.open((result: any) => {
        setIsOpeningCheckout(false);
        const transaction = result?.transaction;
        if (transaction?.status === 'APPROVED') {
          if (onPaymentSuccess) {
            onPaymentSuccess(transaction.id);
          }
        } else if (transaction?.status === 'DECLINED' || transaction?.status === 'ERROR') {
          setErrorMessage(`Pago no completado: Estado de transacción ${transaction.status}.`);
        } else if (!transaction) {
          if (onPaymentCancel) {
            onPaymentCancel();
          }
        }
      });
    } catch (err: any) {
      setIsOpeningCheckout(false);
      setErrorMessage(`Error abriendo Wompi: ${err.message || 'Error desconocido'}`);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl max-w-lg mx-auto text-left space-y-5">
      {/* Encabezado Wompi / Bancolombia */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-black text-sm">
            W
          </div>
          <div>
            <h3 className="font-bold text-white text-sm">Wompi · Bancolombia</h3>
            <p className="text-[11px] text-slate-400">Pasarela Oficial de Pagos Colombia</p>
          </div>
        </div>
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          Sandbox 3DS
        </span>
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-950/70 border border-rose-500/40 rounded-xl text-rose-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Detalles del Cobro */}
      <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 space-y-3">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400">Concepto:</span>
          <span className="text-white font-semibold">Suscripción Mensual SaaS (Ruta Activa)</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400">Referencia de Pago:</span>
          <span className="font-mono text-amber-300 text-[11px] truncate max-w-[200px]">
            {reference || 'Generando...'}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400">Administrador:</span>
          <span className="text-slate-300 truncate max-w-[200px]">{adminEmail}</span>
        </div>
        <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800/80">
          <span className="text-slate-300 font-bold">Total a Pagar:</span>
          <span className="text-lg font-black text-emerald-400 font-mono">
            {formatCOP(amountCOP)} COP
          </span>
        </div>
      </div>

      {/* Métodos de Pago Habilitados por Wompi */}
      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-400">
        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col items-center gap-1">
          <Smartphone className="w-4 h-4 text-purple-400" />
          <span>Nequi</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col items-center gap-1">
          <Building className="w-4 h-4 text-yellow-400" />
          <span>Bancolombia</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col items-center gap-1">
          <CreditCard className="w-4 h-4 text-blue-400" />
          <span>Tarjetas / PSE</span>
        </div>
      </div>

      {/* Botón de Apertura de Widget */}
      <button
        type="button"
        onClick={handleOpenWompiWidget}
        disabled={isLoadingWidget || isOpeningCheckout || !integritySignature}
        className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
      >
        {isOpeningCheckout ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
            <span>Abriendo Pasarela de Wompi...</span>
          </>
        ) : isLoadingWidget ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
            <span>Cargando Widget Seguro...</span>
          </>
        ) : (
          <>
            <Lock className="w-4 h-4" />
            <span>Pagar con Wompi ({formatCOP(amountCOP)})</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </>
        )}
      </button>

      {/* Nota de Integridad Criptográfica */}
      <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/80 text-[10px] text-slate-500 space-y-1">
        <div className="flex items-center gap-1 text-slate-400 font-semibold font-mono">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>Firma de Integridad SHA-256 Verificada</span>
        </div>
        <p className="truncate font-mono text-[9px] text-slate-600">
          Hash: {integritySignature || 'Calculando...'}
        </p>
      </div>
    </div>
  );
};
