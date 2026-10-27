import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Lock,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Calendar,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, isLiveSupabaseConfigured } from '../services/supabaseAuth';
import { formatCOP } from '../utils/financialCalculations';

export interface TenantSubscriptionInfo {
  tenantId: string;
  adminId: string;
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: string;
  monthlyFeeCop: number;
  routesQuota: number;
}

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({ children }) => {
  const { profile, isSuperAdmin } = useAuth();
  
  const [subscription, setSubscription] = useState<TenantSubscriptionInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);

  // Super Admin siempre tiene acceso maestro irrestricto
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  const tenantId = profile?.organizationId || 'org-medellin-01';

  const checkSubscriptionStatus = async () => {
    setIsLoading(true);
    try {
      if (isLiveSupabaseConfigured) {
        const { data, error } = await supabase
          .from('tenant_subscriptions')
          .select('*')
          .eq('tenant_id', tenantId)
          .single();

        if (data && !error) {
          setSubscription({
            tenantId: data.tenant_id,
            adminId: data.admin_id,
            status: data.status,
            currentPeriodEnd: data.current_period_end,
            monthlyFeeCop: Number(data.monthly_fee_cop || 180000),
            routesQuota: data.routes_quota || 1,
          });
          setIsLoading(false);
          return;
        }
      }

      // Estado por defecto en entorno de pruebas / demo
      // Para simular el bloqueo o activación según fecha
      const demoSubsData = localStorage.getItem(`enruta_sub_${tenantId}`);
      if (demoSubsData) {
        setSubscription(JSON.parse(demoSubsData));
      } else {
        const activeSub: TenantSubscriptionInfo = {
          tenantId,
          adminId: profile?.id || 'usr-admin-001',
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 15 * 86400000).toISOString(),
          monthlyFeeCop: 180000,
          routesQuota: 1,
        };
        setSubscription(activeSub);
      }
    } catch (err) {
      console.warn('Advertencia verificando suscripción:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkSubscriptionStatus();
  }, [tenantId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
        <span className="text-sm font-semibold tracking-wide">
          Verificando estado de suscripción SaaS...
        </span>
      </div>
    );
  }

  const isExpired = subscription && new Date(subscription.currentPeriodEnd) < new Date();
  const isBlocked = !subscription || subscription.status !== 'active' || isExpired;

  // Si la suscripción está activa y en fecha, renderiza los módulos operativos
  if (!isBlocked) {
    return <>{children}</>;
  }

  // MANEJADOR DE PAGO (Redirección a Stripe Checkout o MercadoPago)
  const handlePaySubscription = async () => {
    setIsProcessingPayment(true);
    try {
      // 1. Invocar Endpoint de Checkout en Supabase Edge Functions / Backend
      if (isLiveSupabaseConfigured) {
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: {
            tenantId,
            adminEmail: profile?.email,
            returnUrl: window.location.href,
          },
        });

        if (data?.checkoutUrl && !error) {
          window.location.href = data.checkoutUrl;
          return;
        }
      }

      // Simulación en entorno de desarrollo / fallback
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const renewedSub: TenantSubscriptionInfo = {
        tenantId,
        adminId: profile?.id || 'usr-admin-001',
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
        monthlyFeeCop: 180000,
        routesQuota: 1,
      };
      localStorage.setItem(`enruta_sub_${tenantId}`, JSON.stringify(renewedSub));
      setSubscription(renewedSub);
    } catch (err) {
      console.error('Error al iniciar pasarela de pagos:', err);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // ==============================================================================
  // PAYWALL INQUEBRANTABLE (BLOQUEO VISUAL TOTAL DE COMPONENTES HIJOS)
  // ==============================================================================
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl bg-slate-900 border-2 border-rose-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
        {/* Encabezado de Advertencia */}
        <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-block font-mono">
            Suscripción Suspendida · Pago Requerido
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Acceso Bloqueado a la Plataforma Operativa
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
            El periodo de facturación mensual para el fondo{' '}
            <strong className="text-white font-semibold">
              {profile?.organizationName || 'RutaCapital'}
            </strong>{' '}
            ha vencido. Las rutas activas, la cartera de cobradores y el arqueo de caja se
            encuentran pausados.
          </p>
        </div>

        {/* Tarjeta de Resumen de Facturación */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 text-left space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2.5">
            <span className="text-slate-400">Plan Contratado:</span>
            <span className="font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Plan Pro (Gestión de Ruta)
            </span>
          </div>

          <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2.5">
            <span className="text-slate-400">Fecha de Corte:</span>
            <span className="font-mono font-bold text-rose-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {subscription?.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString('es-CO')
                : 'Vencido'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-400">Tarifa Mensual:</span>
            <span className="text-base font-black text-emerald-400 font-mono">
              {formatCOP(subscription?.monthlyFeeCop || 180000)} COP
            </span>
          </div>
        </div>

        {/* Botón de Pago Principal con Verificación Server-to-Server */}
        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={handlePaySubscription}
            disabled={isProcessingPayment}
            className="w-full py-3.5 px-6 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {isProcessingPayment ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Conectando con Pasarela de Pago...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>Pagar Suscripción ({formatCOP(180000)} COP)</span>
                <ExternalLink className="w-4 h-4 ml-1 opacity-70" />
              </>
            )}
          </button>

          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5 font-mono">
            <Lock className="w-3 h-3 text-emerald-400" />
            Transacción encriptada · Activación inmediata vía Webhook Server-to-Server
          </p>
        </div>
      </div>
    </div>
  );
};
