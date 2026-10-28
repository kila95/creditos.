import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, ShieldCheck, Loader2, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Tipado oficial para el Widget de Wompi (Bancolombia)
declare global {
  interface Window {
    WidgetCheckout?: new (config: {
      currency: 'COP';
      amountInCents: number;
      reference: string;
      publicKey: string;
      signature: { integrity: string };
      redirectUrl?: string;
      expirationTime?: string;
      customerData?: {
        email?: string;
        fullName?: string;
        phoneNumber?: string;
        phoneNumberPrefix?: string;
        legalId?: string;
        legalIdType?: 'CC' | 'NIT' | 'CE' | 'PP';
      };
    }) => {
      open: (callback: (result: { transaction: WompiTransactionResult }) => void) => void;
    };
  }
}

export interface WompiTransactionResult {
  id: string;
  status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
  reference: string;
  amountInCents: number;
  currency: 'COP';
  paymentMethodType?: string;
}

export interface WompiCheckoutProps {
  /** UUID del administrador / tenant cuya suscripción se va a activar o renovar */
  tenantId: string;
  /** Nombre del plan de suscripción */
  planName?: string;
  /** Monto en Pesos Colombianos (COP). Ejemplo: 150000 para $150.000 COP */
  amountInCOP: number;
  /** Correo del administrador */
  customerEmail?: string;
  /** Nombre completo del administrador */
  customerName?: string;
  /** Teléfono celular (opcional para prellenar Wompi) */
  customerPhone?: string;
  /** Documento de identidad (opcional para prellenar Wompi) */
  customerLegalId?: string;
  /** URL de redirección post-pago opcional */
  redirectUrl?: string;
  /** Callback ejecutado cuando Wompi confirma estado APPROVED en el widget */
  onPaymentSuccess?: (transaction: WompiTransactionResult) => void;
  /** Callback ejecutado si ocurre un error o rechazo */
  onPaymentError?: (errorMessage: string) => void;
}

interface IntegritySignaturePayload {
  reference: string;
  amountInCents: number;
  currency: 'COP';
  integritySignature: string;
  expirationTime?: string;
}

const WOMPI_WIDGET_SCRIPT_URL = 'https://checkout.wompi.co/widget.js';

/**
 * Componente modular y aislado para el cobro de suscripciones de Administradores (Tenants)
 * mediante el Widget oficial de Wompi (Bancolombia).
 */
export const WompiCheckout: React.FC<WompiCheckoutProps> = ({
  tenantId,
  planName = 'Suscripción Mensual Administrador',
  amountInCOP,
  customerEmail,
  customerName,
  customerPhone,
  customerLegalId,
  redirectUrl,
  onPaymentSuccess,
  onPaymentError,
}) => {
  const [widgetReady, setWidgetReady] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transactionResult, setTransactionResult] = useState<WompiTransactionResult | null>(null);

  // Lectura estricta de la llave pública desde variables de entorno Vite
  const wompiPublicKey = import.meta.env.VITE_WOMPI_PUBLIC_KEY as string | undefined;

  // Wompi exige el monto expresado en centavos (COP * 100)
  const amountInCents = Math.round(amountInCOP * 100);

  // 1. Carga dinámica del script de Wompi (`https://checkout.wompi.co/widget.js`)
  useEffect(() => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${WOMPI_WIDGET_SCRIPT_URL}"]`
    );

    if (existingScript) {
      if (window.WidgetCheckout) {
        setWidgetReady(true);
      } else {
        existingScript.addEventListener('load', () => setWidgetReady(true));
      }
      return;
    }

    const script = document.createElement('script');
    script.src = WOMPI_WIDGET_SCRIPT_URL;
    script.async = true;
    script.onload = () => setWidgetReady(true);
    script.onerror = () => {
      setErrorMsg('No se pudo cargar el script del Widget de Wompi. Verifica tu conexión.');
    };
    document.body.appendChild(script);
  }, []);

  /**
   * 2. Preparación de la Firma de Integridad (SHA-256)
   * Regla de Wompi: SHA256(referencia + montoEnCentavos + moneda + [expirationTime] + secreto_integridad)
   *
   * Por seguridad financiera, el `secreto_integridad` NUNCA viaja al frontend.
   * Esta función solicita el hash firmado a la Edge Function `wompi-signature` en el backend.
   */
  const prepareTransactionIntegritySignature = useCallback(
    async (
      reference: string,
      cents: number,
      currency: 'COP'
    ): Promise<IntegritySignaturePayload> => {
      const { data, error } = await supabase.functions.invoke<IntegritySignaturePayload>(
        'wompi-signature',
        {
          body: {
            tenantId,
            reference,
            amountInCents: cents,
            currency,
          },
        }
      );

      if (error || !data?.integritySignature) {
        throw new Error(
          error?.message ||
            'Error al generar la firma de integridad SHA-256 en el servidor.'
        );
      }

      return data;
    },
    [tenantId]
  );

  // 3. Inicialización y apertura del Widget de Pago de Wompi
  const handleStartSubscriptionPayment = async () => {
    setErrorMsg(null);
    setTransactionResult(null);

    if (!wompiPublicKey) {
      const msg =
        'Configuración incompleta: No se encontró VITE_WOMPI_PUBLIC_KEY en las variables de entorno.';
      setErrorMsg(msg);
      onPaymentError?.(msg);
      return;
    }

    if (!tenantId) {
      const msg = 'No se especificó el identificador del Administrador (tenantId).';
      setErrorMsg(msg);
      onPaymentError?.(msg);
      return;
    }

    if (!widgetReady || !window.WidgetCheckout) {
      const msg = 'El módulo de pagos de Wompi aún se está cargando. Intenta nuevamente.';
      setErrorMsg(msg);
      onPaymentError?.(msg);
      return;
    }

    setIsProcessing(true);

    try {
      // Referencia única trazable por el webhook: ${tenant_id}-${Date.now()}
      const uniqueReference = `${tenantId}-${Date.now()}`;
      const currency: 'COP' = 'COP';

      // Obtener firma de integridad SHA-256 generada en el backend
      const signedTransaction = await prepareTransactionIntegritySignature(
        uniqueReference,
        amountInCents,
        currency
      );

      const checkout = new window.WidgetCheckout({
        currency: signedTransaction.currency,
        amountInCents: signedTransaction.amountInCents,
        reference: signedTransaction.reference,
        publicKey: wompiPublicKey,
        signature: {
          integrity: signedTransaction.integritySignature,
        },
        ...(redirectUrl ? { redirectUrl } : {}),
        ...(signedTransaction.expirationTime
          ? { expirationTime: signedTransaction.expirationTime }
          : {}),
        customerData: {
          email: customerEmail,
          fullName: customerName,
          ...(customerPhone
            ? { phoneNumber: customerPhone, phoneNumberPrefix: '+57' }
            : {}),
          ...(customerLegalId
            ? { legalId: customerLegalId, legalIdType: 'CC' }
            : {}),
        },
      });

      checkout.open((result) => {
        const tx = result?.transaction;
        if (!tx) return;

        setTransactionResult(tx);

        if (tx.status === 'APPROVED') {
          onPaymentSuccess?.(tx);
        } else if (tx.status === 'DECLINED' || tx.status === 'ERROR') {
          onPaymentError?.(`Transacción finalizada con estado: ${tx.status}`);
        }
      });
    } catch (err: any) {
      const message =
        err?.message || 'No se pudo iniciar la pasarela de pago con Wompi.';
      setErrorMsg(message);
      onPaymentError?.(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl max-w-md w-full text-slate-100">
      {/* Cabecera del Resumen de Suscripción */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold block">
            Pasarela Segura Wompi • Bancolombia
          </span>
          <h3 className="text-base font-bold text-white mt-0.5">{planName}</h3>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-lg">
          <CreditCard className="w-5 h-5 text-emerald-400" />
        </div>
      </div>

      {/* Detalle Financiero */}
      <div className="space-y-2 mb-5 bg-slate-950/80 p-3.5 rounded-lg border border-slate-800/80">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>ID Tenant / Admin:</span>
          <span className="font-mono text-slate-300 truncate max-w-[180px]">
            {tenantId}
          </span>
        </div>
        <div className="flex items-baseline justify-between pt-2 border-t border-slate-800/60">
          <span className="text-xs font-medium text-slate-300">Valor Suscripción:</span>
          <span className="text-xl font-extrabold text-white">
            ${amountInCOP.toLocaleString('es-CO')}{' '}
            <span className="text-xs font-normal text-slate-400">COP</span>
          </span>
        </div>
      </div>

      {/* Alerta de Error */}
      {errorMsg && (
        <div className="mb-4 flex items-start gap-2.5 bg-red-950/50 border border-red-800/70 text-red-200 px-3.5 py-2.5 rounded-lg text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Estado de la Transacción devuelto por el Widget */}
      {transactionResult && (
        <div
          className={`mb-4 flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg text-xs border ${
            transactionResult.status === 'APPROVED'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
              : 'bg-amber-950/40 border-amber-800/60 text-amber-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
          <div>
            <p className="font-semibold">
              Estado de transacción: {transactionResult.status}
            </p>
            <p className="text-[11px] opacity-80 font-mono mt-0.5">
              Ref: {transactionResult.reference}
            </p>
          </div>
        </div>
      )}

      {/* Botón de Pago con Widget de Wompi */}
      <button
        type="button"
        onClick={handleStartSubscriptionPayment}
        disabled={isProcessing || !widgetReady}
        className="w-full py-3 px-4 rounded-lg font-semibold text-sm bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Generando firma de integridad...</span>
          </>
        ) : (
          <>
            <Lock className="w-4 h-4" />
            <span>Pagar Suscripción con Wompi</span>
          </>
        )}
      </button>

      {/* Pie de Seguridad Criptográfica */}
      <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>Integridad SHA-256 verificada • PSE, Nequi, Bancolombia y Tarjetas</span>
      </div>
    </div>
  );
};

export default WompiCheckout;
