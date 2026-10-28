import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Calendar,
  CreditCard,
  Lock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const WOMPI_SCRIPT_URL = 'https://checkout.wompi.co/widget.js';
const WOMPI_SCRIPT_ID = 'wompi-widget-checkout-script';

// Valor estricto mensual en centavos: $140.000 COP = 14000000 centavos
export const FIXED_MONTHLY_COP = 140000;
export const FIXED_AMOUNT_IN_CENTS = 14000000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

declare global {
  interface Window {
    WidgetCheckout?: new (config: Record<string, unknown>) => {
      open: (callback: (result: { transaction?: WompiTransactionResult }) => void) => void;
    };
  }
}

export interface WompiTransactionResult {
  id: string;
  status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
  reference: string;
  amountInCents: number;
  currency: string;
  paymentMethodType?: string;
}

export interface SubscriptionPaywallProps {
  tenantId?: string;
  amountInCents?: number;
  monthlyAmountCOP?: number;
  currency?: 'COP';
  planName?: string;
  customerEmail?: string;
  customerName?: string;
  redirectUrl?: string;
  children?: React.ReactNode;
  onSubscriptionActivated?: (transaction?: WompiTransactionResult) => void;
}

interface TenantSubscriptionRecord {
  tenant_id: string;
  status: 'trialing' | 'active' | 'inactive' | 'past_due' | 'canceled' | 'expired';
  trial_end: string | null;
  current_period_end?: string | null;
}

const getLocalTrialStorageKey = (tenantId: string) =>
  `rc_tenant_subscription_${tenantId}`;

export const SubscriptionPaywall: React.FC<SubscriptionPaywallProps> = ({
  tenantId,
  customerEmail,
  customerName,
  redirectUrl,
  children,
  onSubscriptionActivated,
}) => {
  const { user, profile } = useAuth();
  const effectiveTenantId =
    tenantId || profile?.organizationId || user?.id || 'org-medellin-01';

  const [isScriptReady, setIsScriptReady] = useState<boolean>(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastTransaction, setLastTransaction] = useState<WompiTransactionResult | null>(null);
  const [subscription, setSubscription] = useState<TenantSubscriptionRecord | null>(null);

  // 1. Inyección dinámica del script oficial de Wompi (`https://checkout.wompi.co/widget.js`)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.WidgetCheckout) {
      setIsScriptReady(true);
      return;
    }

    const existingScript = document.getElementById(WOMPI_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      const handleLoad = () => setIsScriptReady(true);
      existingScript.addEventListener('load', handleLoad);
      return () => existingScript.removeEventListener('load', handleLoad);
    }

    const script = document.createElement('script');
    script.id = WOMPI_SCRIPT_ID;
    script.src = WOMPI_SCRIPT_URL;
    script.async = true;
    script.onload = () => setIsScriptReady(true);
    script.onerror = () => {
      setErrorMessage(
        'No se pudo cargar el script oficial de Wompi (checkout.wompi.co/widget.js).'
      );
    };

    document.body.appendChild(script);
  }, []);

  // 2. Consulta del estado de suscripción (`status`, `trial_end`) en Supabase
  const fetchSubscriptionStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select('tenant_id, status, trial_end, current_period_end')
        .eq('tenant_id', effectiveTenantId)
        .maybeSingle();

      if (!error && data) {
        const record: TenantSubscriptionRecord = {
          tenant_id: data.tenant_id || effectiveTenantId,
          status: data.status,
          trial_end: data.trial_end || null,
          current_period_end: data.current_period_end || null,
        };
        setSubscription(record);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(
            getLocalTrialStorageKey(effectiveTenantId),
            JSON.stringify(record)
          );
        }
        setIsLoadingStatus(false);
        return;
      }

      if (typeof window !== 'undefined') {
        const cached = window.localStorage.getItem(
          getLocalTrialStorageKey(effectiveTenantId)
        );
        if (cached) {
          setSubscription(JSON.parse(cached));
          setIsLoadingStatus(false);
          return;
        }
      }

      setSubscription(null);
    } catch {
      setSubscription(null);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  // Evaluación de estado de prueba y suscripción:
  const nowMs = Date.now();
  const trialEndMs = subscription?.trial_end
    ? new Date(subscription.trial_end).getTime()
    : null;

  // ¿Está en su semana gratis vigente? (`status === 'trialing'` y fecha actual < `trial_end`)
  const isTrialValid =
    subscription?.status === 'trialing' &&
    Boolean(trialEndMs && nowMs < trialEndMs);

  // ¿Tiene acceso permitido al panel operativo? (`active` o en semana de prueba vigente)
  const isAccessGranted = subscription?.status === 'active' || isTrialValid;

  // ¿Ya pasó por la prueba (expirada) o su suscripción está 'inactive'?
  const hasUsedOrExpiredTrial =
    Boolean(trialEndMs && nowMs >= trialEndMs) ||
    subscription?.status === 'inactive' ||
    subscription?.status === 'past_due' ||
    subscription?.status === 'expired';

  // Si la suscripción o semana gratis es válida y este componente envuelve `children`, permite pasar al panel operativo
  useEffect(() => {
    if (isAccessGranted) {
      onSubscriptionActivated?.();
    }
  }, [isAccessGranted, onSubscriptionActivated]);

  if (isAccessGranted && children) {
    return <>{children}</>;
  }

  // 3. Iniciar 7 Días Gratis para administradores nuevos (`status = 'trialing'`, `trial_end = hoy + 7 días`)
  const handleStartFreeTrial = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsProcessing(true);

    try {
      const trialEndIso = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();
      const newTrialRecord: TenantSubscriptionRecord = {
        tenant_id: effectiveTenantId,
        status: 'trialing',
        trial_end: trialEndIso,
        current_period_end: trialEndIso,
      };

      const { error: upsertError } = await supabase
        .from('tenant_subscriptions')
        .upsert(
          {
            tenant_id: effectiveTenantId,
            status: 'trialing',
            trial_end: trialEndIso,
            current_period_end: trialEndIso,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id' }
        );

      if (upsertError) {
        console.warn(
          '[SubscriptionPaywall] Respaldo local de prueba gratuita:',
          upsertError.message
        );
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          getLocalTrialStorageKey(effectiveTenantId),
          JSON.stringify(newTrialRecord)
        );
      }

      setSubscription(newTrialRecord);
      setSuccessMessage(
        '¡Semana gratis activada exitosamente! Redirigiendo al panel operativo...'
      );
      onSubscriptionActivated?.();
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'No fue posible iniciar los 7 días de prueba gratis.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Desplegar el Web Checkout de Wompi enviando valor estricto de 14000000 (centavos)
  const handleOpenWompiCheckout = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const publicKey = import.meta.env.VITE_WOMPI_PUBLIC_KEY;
    if (!publicKey) {
      setErrorMessage(
        'Falta configurar la llave pública VITE_WOMPI_PUBLIC_KEY en el entorno.'
      );
      return;
    }

    if (!window.WidgetCheckout) {
      setErrorMessage(
        'El Widget de Wompi aún se está cargando. Intenta nuevamente en unos segundos.'
      );
      return;
    }

    setIsProcessing(true);

    try {
      // Referencia trazable con el tenant_id del administrador
      const reference = `${effectiveTenantId}-${Date.now()}`;

      // Solicitar firma SHA-256 al backend (Edge Function `generate-wompi-signature`)
      const { data, error } = await supabase.functions.invoke(
        'generate-wompi-signature',
        {
          body: {
            tenantId: effectiveTenantId,
            reference,
            amountInCents: FIXED_AMOUNT_IN_CENTS, // 14000000 centavos
            currency: 'COP',
          },
        }
      );

      if (error || !data?.signature) {
        throw new Error(
          error?.message ||
            'Error obteniendo la firma de integridad desde generate-wompi-signature.'
        );
      }

      const checkout = new window.WidgetCheckout({
        currency: 'COP',
        amountInCents: FIXED_AMOUNT_IN_CENTS, // Valor estricto: 14000000 centavos ($140.000 COP)
        reference: data.reference || reference,
        publicKey,
        signature: {
          integrity: data.signature,
        },
        ...(redirectUrl ? { redirectUrl } : {}),
        customerData: {
          email: customerEmail || profile?.email || user?.email || undefined,
          fullName: customerName || profile?.fullName || undefined,
        },
      });

      checkout.open((result) => {
        const transaction = result?.transaction;
        if (transaction) {
          setLastTransaction(transaction);
          if (transaction.status === 'APPROVED') {
            const activeRecord: TenantSubscriptionRecord = {
              tenant_id: effectiveTenantId,
              status: 'active',
              trial_end: subscription?.trial_end || null,
              current_period_end: new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000
              ).toISOString(),
            };
            setSubscription(activeRecord);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(
                getLocalTrialStorageKey(effectiveTenantId),
                JSON.stringify(activeRecord)
              );
            }
            onSubscriptionActivated?.(transaction);
          }
        }
      });
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Ocurrió un error al desplegar el Web Checkout de Wompi.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-4 py-12">
      {/* Título y Subtítulo Descriptivo */}
      <div className="text-center max-w-xl mx-auto mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Suscripción de Administrador
        </h1>
        <p className="text-sm sm:text-base text-slate-400 mt-2.5 leading-relaxed">
          Habilita el acceso completo al panel operativo de rutas, control de cartera en tiempo real y conciliación financiera segura.
        </p>
      </div>

      {/* Tarjeta Central */}
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
        {/* Badge (Etiqueta) Superior Amarillo */}
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400 text-slate-950 text-xs sm:text-sm font-extrabold tracking-wide uppercase shadow-lg shadow-amber-400/20">
            <Sparkles className="w-4 h-4 fill-slate-950" />
            ¡PRUEBA GRATIS! 1 Semana Gratis de Prueba
          </span>
        </div>

        {/* Alerta de bloqueo si la prueba expiró o la suscripción está 'inactive' */}
        {hasUsedOrExpiredTrial && (
          <div className="mb-6 bg-rose-950/60 border border-rose-500/40 rounded-2xl p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-200 leading-relaxed">
              <p className="font-bold text-rose-300 uppercase tracking-wider mb-0.5">
                Suscripción Inactiva o Periodo de Prueba Expirado
              </p>
              El acceso al panel operativo se encuentra bloqueado. Realiza el pago de tu mensualidad mediante Wompi para reactivar tu cuenta inmediatamente.
            </div>
          </div>
        )}

        {/* Lista de Especificaciones dentro de la Tarjeta */}
        <ul className="bg-slate-950/90 border border-slate-800 rounded-2xl p-5 space-y-4 mb-6">
          <li className="flex items-center gap-3 text-sm sm:text-base text-slate-200">
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <span className="font-medium">
              Ciclo de facturación: Mensual (30 días)
            </span>
          </li>

          <li className="flex items-center gap-3 text-sm sm:text-base text-slate-200">
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <span className="font-medium">
              Medios habilitados: PSE, Nequi, Bancolombia, Tarjetas de Crédito
            </span>
          </li>
        </ul>

        {/* Texto Grande Destacado Abajo en la Tarjeta */}
        <div className="text-center py-4 mb-6 bg-slate-950/60 border border-emerald-500/20 rounded-2xl">
          <p className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight font-mono">
            TOTAL MENSUALIDAD $140.000 COP
          </p>
        </div>

        {/* Mensajes de Estado */}
        {errorMessage && (
          <div className="mb-5 bg-rose-950/60 border border-rose-500/40 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-5 bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {lastTransaction && (
          <div className="mb-5 bg-slate-950 border border-emerald-500/30 rounded-xl p-3.5 flex items-center justify-between text-xs">
            <span className="text-emerald-300 font-semibold">
              Transacción Wompi #{lastTransaction.id} ({lastTransaction.status})
            </span>
            <span className="font-mono text-slate-400">
              {lastTransaction.reference}
            </span>
          </div>
        )}

        {/* Botón de Acción Verde, Ancho y Redondeado */}
        {!hasUsedOrExpiredTrial ? (
          <button
            type="button"
            onClick={handleStartFreeTrial}
            disabled={isProcessing || isLoadingStatus}
            className="w-full py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold text-sm sm:text-base shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isProcessing || isLoadingStatus ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Procesando activación...</span>
              </>
            ) : (
              <span>
                Activar Suscripción (Iniciar 7 Días Gratis) -&gt; Comenzar Prueba Gratis
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleOpenWompiCheckout}
            disabled={isProcessing || !isScriptReady}
            className="w-full py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold text-sm sm:text-base shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Abriendo Web Checkout de Wompi...</span>
              </>
            ) : (
              <span>Pagar Mensualidad ($140.000 COP) con Wompi</span>
            )}
          </button>
        )}

        {/* Opción para desplegar el Web Checkout de Wompi directamente si aún no ha expirado la prueba */}
        {!hasUsedOrExpiredTrial && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={handleOpenWompiCheckout}
              disabled={isProcessing || !isScriptReady}
              className="text-xs font-mono text-emerald-400 hover:text-emerald-300 underline underline-offset-4 cursor-pointer"
            >
              ¿Ya completaste tu prueba? Pagar Mensualidad ($140.000 COP) en Wompi
            </button>
          </div>
        )}

        {/* Pie de Seguridad */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            Wompi Bancolombia · 14000000 centavos
          </span>
          <span>Tenant: {effectiveTenantId}</span>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPaywall;
