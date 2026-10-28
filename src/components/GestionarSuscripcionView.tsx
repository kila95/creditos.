import React from 'react';
import { CreditCard, ShieldCheck, Receipt } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SubscriptionPaywall, FIXED_AMOUNT_IN_CENTS } from './SubscriptionPaywall';
import { HistorialPagos } from './HistorialPagos';

interface GestionarSuscripcionViewProps {
  tenantId?: string;
  onSubscriptionActivated?: () => void;
}

export const GestionarSuscripcionView: React.FC<GestionarSuscripcionViewProps> = ({
  tenantId,
  onSubscriptionActivated,
}) => {
  const { user, profile } = useAuth();
  const effectiveTenantId =
    tenantId || profile?.organizationId || user?.id || 'org-medellin-01';

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-2">
      {/* Encabezado de la pantalla /admin/suscripcion */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono mb-2">
            <CreditCard className="w-3.5 h-3.5" />
            <span>/admin/suscripcion · Pasarela Wompi Bancolombia</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Gestionar Suscripción
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Activa tu semana de prueba gratis o realiza el pago de tu mensualidad ($140.000 COP) mediante el Web Checkout oficial de Wompi.
          </p>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-3 shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono block">
            ID de Administrador (Tenant)
          </span>
          <span className="text-xs font-mono font-bold text-emerald-400">
            {effectiveTenantId}
          </span>
        </div>
      </div>

      {/* Contenedor del componente SubscriptionPaywall */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <SubscriptionPaywall
          tenantId={effectiveTenantId}
          amountInCents={FIXED_AMOUNT_IN_CENTS}
          currency="COP"
          customerEmail={profile?.email || user?.email}
          customerName={profile?.fullName}
          onSubscriptionActivated={onSubscriptionActivated}
        />

        <div className="pb-6 flex items-center justify-center gap-2 text-xs text-slate-400 font-mono">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Tarifa Fija Blindada: $140.000 COP (14000000 centavos) · Anti-Replay Idempotente
          </span>
        </div>
      </div>

      {/* Historial de comprobantes del administrador */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Receipt className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
            Comprobantes Históricos de Facturación
          </h2>
        </div>
        <HistorialPagos tenantId={effectiveTenantId} />
      </div>
    </div>
  );
};

export default GestionarSuscripcionView;
