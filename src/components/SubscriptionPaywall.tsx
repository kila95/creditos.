import React, { useState, useEffect } from 'react';
import { ShieldAlert, CreditCard, Lock, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Tipado global para el Widget oficial de Wompi (Bancolombia)
declare global {
  interface Window {
    WidgetCheckout?: new (config: {
      currency: 'COP';
      amountInCents: number;
      reference: string;
      publicKey: string;
      signature: { integrity: string };
      redirectUrl?: string;
      customerData?: {
        email?: string;
        fullName?: string;
      };
    }) => {
      open: (callback: (result: { transaction: any }) => void) => void;
    };
  }
}

export interface SubscriptionPaywallProps {
  tenantId?: string;
  /** Monto mensual en pesos colombianos (COP). Por defecto $150.000 COP */
  monthlyAmountCOP?: number;
  customerEmail?: string;
  customerName?: string;
  redirectUrl?: string;
  onSubscriptionActivated?: (transaction: any) => void;
}

interface GenerateSignatureResponse {
  signature: string;
  reference: string;
  amountInCents: number;
  currency: 'COP';
}

const WOMPI_SCRIPT_URL = 'https://checkout.wompi.co/widget.js';

export const SubscriptionPaywall: React.FC<SubscriptionPaywallProps> = ({
  tenantId,
  monthlyAmountCOP = 150000,
  customerEmail,
  customerName,
  redirectUrl,
  onSubscriptionActivated,
}) => {
  const [isScriptReady, setIsScriptReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);

  const publicKey = import.meta.env.VITE_WOMPI_PUBLIC_KEY as string | undefined;
  const amountInCents = Math.round(monthlyAmountCOP * 100);

  // 1. Inyección dinámica del Script oficial de Wompi
  useEffect(() => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${WOMPI_SCRIPT_URL}"]`
    );

    if (existingScript) {
      if (window.WidgetCheckout) {
        setIsScriptReady(true);
      } else {
        existingScript.addEventListener('load', () => setIsScriptReady(true));
      }
      return;
    }

    const script = document.createElement('script');
    script.src = WOMPI_SCRIPT_URL;
    script.async = true;
    script.onload = () => setIsScriptReady(true);
    script.onerror = () => {
      setErrorMessage('Error al cargar el motor de pagos de Wompi. Revisa tu conexión.');
    };
    document.body.appendChild(script);
  }, []);

  // 2. Flujo de cobro y solicitud de Firma de Integridad al Backend
  const handleActivateSubscription = async () => {
    setErrorMessage(null);
    setTransactionStatus(null);

    if (!publicKey) {
      setErrorMessage('Falta configurar la variable de entorno VITE_WOMPI_PUBLIC_KEY.');
      return;
    }

    if (!isScriptReady || !window.WidgetCheckout) {
      setErrorMessage('El Widget de Wompi aún se está inicializando. Intenta en unos segundos.');
      return;
    }

    setIsLoading(true);

    try {
      // Generación de referencia única basada en UUID (con prefijo de tenant si está disponible)
      const uuid = crypto.randomUUID();
      const reference = tenantId ? `SUB_${tenantId}_${uuid}` : `SUB_${uuid}`;
      const currency: 'COP' = 'COP';

      // 3. Llamada segura a la Edge Function `generate-wompi-signature`
      // NUNCA se calcula el hash SHA-256 en el cliente para no exponer el secreto de integridad
      const { data, error } = await supabase.functions.invoke<GenerateSignatureResponse>(
        'generate-wompi-signature',
        {
          body: {
            reference,
            amountInCents,
            currency,
            tenantId,
          },
        }
      );

      if (error || !data?.signature) {
        throw new Error(
          error?.message || 'No fue posible obtener la firma criptográfica desde el servidor.'
        );
      }

      // Instanciación del modal oficial de Wompi con la firma inyectada
      const checkout = new window.WidgetCheckout({
        currency,
        amountInCents,
        reference,
        publicKey,
        signature: {
          integrity: data.signature,
        },
        ...(redirectUrl ? { redirectUrl } : {}),
        ...(customerEmail || customerName
          ? {
              customerData: {
                email: customerEmail,
                fullName: customerName,
              },
            }
          : {}),
      });

      checkout.open((result) => {
        const transaction = result?.transaction;
        if (!transaction) return;

        setTransactionStatus(transaction.status);

        if (transaction.status === 'APPROVED') {
          onSubscriptionActivated?.(transaction);
        }
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error iniciando el proceso de activación de suscripción.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] w-full flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl text-center">
        {/* Icono de Paywall */}
        <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-5">
          <ShieldAlert className="w-7 h-7 text-emerald-400" />
        </div>

        <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-md mb-3">
          Licencia Operativa Mensual
        </span>

        <h2 className="text-2xl font-extrabold text-white tracking-tight">
          Suscripción de Administrador
        </h2>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          Activa tu entorno operativo para habilitar el control de cartera, rutas de cobro y cierres de liquidez en tiempo real.
        </p>

        {/* Resumen Financiero */}
        <div className="my-6 bg-slate-950 border border-slate-800/90 rounded-xl p-4 text-left space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Ciclo de facturación</span>
            <span className="font-semibold text-slate-200">Mensual (30 días)</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Medios habilitados</span>
            <span className="font-semibold text-slate-200">PSE, Nequi, Bancolombia, Tarjetas</span>
          </div>
          <div className="pt-2.5 border-t border-slate-800 flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Total Mensualidad
            </span>
            <span className="text-2xl font-black text-white">
              ${monthlyAmountCOP.toLocaleString('es-CO')}{' '}
              <span className="text-xs font-normal text-slate-400">COP</span>
            </span>
          </div>
        </div>

        {/* Mensajes de Error */}
        {errorMessage && (
          <div className="mb-4 flex items-start gap-2.5 bg-red-950/60 border border-red-800/80 text-red-200 px-3.5 py-2.5 rounded-lg text-xs text-left">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Estado de Transacción */}
        {transactionStatus && (
          <div className="mb-4 flex items-center gap-2 bg-emerald-950/50 border border-emerald-800/70 text-emerald-200 px-3.5 py-2.5 rounded-lg text-xs text-left">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Estado de la transacción: <strong className="uppercase">{transactionStatus}</strong>
            </span>
          </div>
        )}

        {/* Botón Central de Cobro */}
        <button
          type="button"
          onClick={handleActivateSubscription}
          disabled={isLoading || !isScriptReady}
          className="w-full py-3.5 px-5 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Firmando transacción segura...</span>
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4" />
              <span>Activar Suscripción</span>
            </>
          )}
        </button>

        {/* Sello de Seguridad */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Procesado por Wompi Bancolombia con firma SHA-256 en servidor</span>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPaywall;
