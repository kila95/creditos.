import React from 'react';
import { 
  ShieldAlert, 
  Lock, 
  LogOut, 
  UserCheck, 
  RefreshCw, 
  ArrowRight, 
  Building, 
  TrendingUp,
  AlertOctagon,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminLoginView } from './AdminLoginView';

interface AdminRouteGuardProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'socio' | 'admin_or_socio';
  onRedirectToAuthorized?: (role: string) => void;
}

export const AdminRouteGuard: React.FC<AdminRouteGuardProps> = ({ 
  children, 
  requiredRole = 'admin_or_socio',
  onRedirectToAuthorized
}) => {
  const { 
    isAuthenticated, 
    isAdminOrSocio, 
    isAdmin, 
    isSocio, 
    profile, 
    role, 
    loading, 
    logout,
    switchDemoUser 
  } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-spin">
          <RefreshCw className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Validando Token JWT & Rol en Supabase...</p>
          <p className="text-xs text-slate-400 font-mono mt-1">SELECT role FROM public.profiles WHERE id = auth.uid()</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado -> Mostrar la vista de Login
  if (!isAuthenticated) {
    return (
      <div className="py-8">
        <AdminLoginView 
          message="Se requiere autenticación con credenciales autorizadas para consultar la información financiera." 
        />
      </div>
    );
  }

  // Validar si el rol cumple con la autorización requerida
  const isAuthorized = 
    requiredRole === 'admin_or_socio' 
      ? (isAdmin || isSocio)
      : requiredRole === 'admin' 
        ? isAdmin 
        : isSocio;

  // Si está autenticado pero con rol insuficiente (ej. Cobrador o Cliente)
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
              403 · Acceso Prohibido por Política RLS
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white">
              Nivel de Seguridad Insuficiente
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
              El usuario actual <strong className="text-white font-mono">{profile?.email}</strong> tiene asignado el rol{' '}
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase font-mono text-xs">
                {role}
              </span>.
            </p>
          </div>

          {/* Explicación de la regla CFO / Supabase */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 text-left space-y-2 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-400 font-bold">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Restricción de Row Level Security (RLS)</span>
            </div>
            <p className="text-slate-400 text-[11px] font-sans leading-normal">
              Las tablas <code className="text-emerald-400 font-mono">route_expenses</code>, <code className="text-emerald-400 font-mono">daily_cash_shifts</code> y <code className="text-emerald-400 font-mono">investor_funds</code> solo permiten operaciones de lectura (<code className="text-blue-400 font-mono">SELECT</code>) a usuarios autenticados con los roles <span className="text-white font-bold">'admin'</span> o <span className="text-white font-bold">'socio'</span>.
            </p>
          </div>

          {/* Acciones de recuperación */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            {role === 'cobrador' && (
              <button
                onClick={() => onRedirectToAuthorized && onRedirectToAuthorized('collector_street')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all"
              >
                Ir a Mi Terminal de Cobro en Calle
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {role === 'cliente' && (
              <button
                onClick={() => onRedirectToAuthorized && onRedirectToAuthorized('client_borrower')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-teal-950/40 transition-all"
              >
                Ir a Mi Portal de Deudor
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => switchDemoUser('admin@rutacapital.co')}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-all"
            >
              Cambiar a Cuenta de Administrador (CFO)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Usuario autorizado (Admin o Socio): Renderizar contenido protegido con barra de seguridad
  return (
    <div className="space-y-4">
      {/* BARRA DE ESTADO DE SESIÓN EJECUTIVA (RBAC CLEARANCE) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:px-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
            isAdmin 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          }`}>
            {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate">
                {profile?.fullName}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase font-mono ${
                isAdmin 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              }`}>
                Rol: {role}
              </span>
              {profile?.partnerEquityPct && profile.partnerEquityPct > 0 && (
                <span className="hidden md:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {profile.partnerEquityPct}% Participación
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-mono truncate">
              {profile?.email} · Sesión validada por Supabase Auth
            </p>
          </div>
        </div>

        {/* Acciones de cambio de cuenta de test y logout */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
            <span className="text-slate-400 px-2 hidden lg:inline">Simular RBAC:</span>
            <button
              onClick={() => switchDemoUser('admin@rutacapital.co')}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                role === 'admin' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Iniciar como Administrador CFO"
            >
              Admin
            </button>
            <button
              onClick={() => switchDemoUser('socio1@rutacapital.co')}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                profile?.email === 'socio1@rutacapital.co' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Iniciar como Socio Inversionista A (35%)"
            >
              Socio A
            </button>
            <button
              onClick={() => switchDemoUser('socio2@rutacapital.co')}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                profile?.email === 'socio2@rutacapital.co' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Iniciar como Socio Inversionista B (25%)"
            >
              Socio B
            </button>
            <button
              onClick={() => switchDemoUser('cobrador@rutacapital.co')}
              className="px-2 py-1 rounded text-[10px] font-bold text-rose-400 hover:bg-rose-950/40 transition-all"
              title="Probar rechazo cambiando a Cobrador"
            >
              Cobrador (Test 403)
            </button>
          </div>

          <button
            onClick={logout}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {children}
    </div>
  );
};
