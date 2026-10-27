import React from 'react';
import { 
  ShieldAlert, 
  Lock, 
  LogOut, 
  RefreshCw, 
  ArrowRight, 
  TrendingUp,
  AlertOctagon,
  ShieldCheck,
  Crown,
  Building2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminLoginView } from './AdminLoginView';

interface AdminRouteGuardProps {
  children: React.ReactNode;
  requiredRole?: 'super_admin' | 'admin' | 'socio' | 'admin_or_socio';
  onRedirectToAuthorized?: (role: string) => void;
}

export const AdminRouteGuard: React.FC<AdminRouteGuardProps> = ({ 
  children, 
  requiredRole = 'admin_or_socio',
  onRedirectToAuthorized
}) => {
  const { 
    isAuthenticated, 
    isSuperAdmin,
    isAdmin, 
    isSocio, 
    isCollector,
    profile, 
    role, 
    loading, 
    logout
  } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-spin">
          <RefreshCw className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Validando Token JWT & Jerarquía de 3 Niveles en Supabase...</p>
          <p className="text-xs text-slate-400 font-mono mt-1">SELECT role, organization_id, created_by FROM public.profiles WHERE id = auth.uid()</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado -> Mostrar la vista de Login
  if (!isAuthenticated) {
    return (
      <div className="py-8">
        <AdminLoginView 
          message="Se requiere autenticación con credenciales autorizadas (super_admin o admin) para consultar la información financiera." 
        />
      </div>
    );
  }

  // Validar si el rol cumple con la autorización requerida
  const isAuthorized = 
    requiredRole === 'super_admin'
      ? isSuperAdmin
      : requiredRole === 'admin_or_socio' 
        ? (isSuperAdmin || isAdmin || isSocio)
        : requiredRole === 'admin' 
          ? (isSuperAdmin || isAdmin) 
          : isSocio;

  // Si está autenticado pero con rol insuficiente
  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto py-10 px-4">
        <div className="bg-slate-900 border-2 border-rose-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 mx-auto flex items-center justify-center text-rose-400">
            <AlertOctagon className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold uppercase tracking-wider">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              403 · Acceso Prohibido por Jerarquía RLS
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white">
              Nivel Jerárquico Insuficiente
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
              El usuario actual <strong className="text-white font-mono">{profile?.email}</strong> tiene asignado el rol{' '}
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase font-mono text-xs">
                {role}
              </span>.
            </p>
          </div>

          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 text-left space-y-2 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-400 font-bold">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Restricción de Row Level Security (RLS 3 Niveles)</span>
            </div>
            <p className="text-slate-400 text-[11px] font-sans leading-normal">
              El panel administrativo solo permite el acceso a roles <span className="text-amber-300 font-bold">'super_admin'</span> o <span className="text-emerald-300 font-bold">'admin'</span>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            {isCollector && (
              <button
                onClick={() => onRedirectToAuthorized && onRedirectToAuthorized('collector_street')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all"
              >
                Ir a Mi Terminal de Cobro en Calle
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:px-4 flex flex-col lg:flex-row items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
            isSuperAdmin
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : isAdmin 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          }`}>
            {isSuperAdmin ? (
              <Crown className="w-5 h-5" />
            ) : isAdmin ? (
              <ShieldCheck className="w-5 h-5" />
            ) : (
              <TrendingUp className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-white truncate">
                {profile?.fullName}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase font-mono ${
                isSuperAdmin
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : isAdmin 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              }`}>
                Rol: {role}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {isSuperAdmin ? 'Visibilidad Total' : `${profile?.organizationName || 'Fondo'} (${profile?.organizationId || 'org-medellin-01'})`}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
              {profile?.email} · UID: {profile?.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
          <button
            onClick={logout}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold px-3"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </div>

      {children}
    </div>
  );
};
