import React, { useEffect, useState } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  AlertOctagon, 
  Building2, 
  Crown, 
  ArrowRight, 
  RefreshCw, 
  LogOut,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types/auth';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  requiredTenantId?: string;
  onUnauthorizedRedirect?: (targetRole: string) => void;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requiredTenantId,
  onUnauthorizedRedirect
}) => {
  const { 
    isAuthenticated, 
    profile, 
    role, 
    loading, 
    logout,
    switchDemoUser 
  } = useAuth();

  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  // 1. Verificación de Rol Activo
  const hasRoleAccess = Boolean(role && allowedRoles.includes(role));

  // 2. Verificación de Tenant ID (Aislamiento Multi-Tenant de Inquilino)
  // 'super_admin' tiene acceso global cross-tenant.
  // 'admin' y 'collector' deben coincidir con el tenant_id (organizationId) de la ruta si se especifica.
  const userTenantId = profile?.organizationId || 'org-medellin-01';
  const hasTenantAccess = 
    role === 'super_admin' || 
    !requiredTenantId || 
    userTenantId === requiredTenantId;

  const isFullyAuthorized = isAuthenticated && hasRoleAccess && hasTenantAccess;

  // Redirección automática estricta tras intento de violación de acceso
  useEffect(() => {
    if (isAuthenticated && !isFullyAuthorized) {
      setRedirectCountdown(3);
      const timer = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            // Determinar destino autorizado por rol
            if (onUnauthorizedRedirect) {
              if (role === 'collector' || role === 'cobrador') {
                onUnauthorizedRedirect('collector_street');
              } else if (role === 'cliente') {
                onUnauthorizedRedirect('client_borrower');
              } else if (role === 'socio') {
                onUnauthorizedRedirect('investor_fund');
              } else if (role === 'admin') {
                onUnauthorizedRedirect('admin_cfo');
              } else {
                onUnauthorizedRedirect('admin_cfo');
              }
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else {
      setRedirectCountdown(null);
    }
  }, [isAuthenticated, isFullyAuthorized, role]);

  // Carga de estado inicial de sesión
  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-spin">
          <RefreshCw className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Validando Guardia de Ruta & RLS Tenant ID...</p>
          <p className="text-xs text-slate-400 font-mono mt-1">
            SELECT role, organization_id FROM profiles WHERE id = auth.uid()
          </p>
        </div>
      </div>
    );
  }

  // 1. Bloqueo por falta de autenticación
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 mx-auto flex items-center justify-center text-amber-400">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold uppercase tracking-wider">
            401 · Sesión Requerida
          </span>
          <h3 className="text-xl font-bold text-white">Acceso Restringido</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Esta ruta requiere iniciar sesión con una cuenta autorizada para la organización.
          </p>
        </div>
        <button
          onClick={logout}
          className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all cursor-pointer"
        >
          Ir a Pantalla de Inicio de Sesión
        </button>
      </div>
    );
  }

  // 2. Bloqueo por Rol Insuficiente o Mismatch de Inquilino (Tenant ID)
  if (!isFullyAuthorized) {
    return (
      <div className="max-w-xl mx-auto py-10 px-4">
        <div className="bg-slate-900 border-2 border-rose-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 mx-auto flex items-center justify-center text-rose-400">
            <AlertOctagon className="w-8 h-8 animate-bounce" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold uppercase tracking-wider">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              403 · Acceso Prohibido por Guardia de Ruta
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white">
              {!hasRoleAccess
                ? 'Violación de Rol Autorizado'
                : 'Acceso Denegado por Inquilino (Tenant ID)'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
              {!hasRoleAccess ? (
                <>
                  Su usuario <strong className="text-white font-mono">{profile?.email}</strong> con rol{' '}
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase font-mono text-xs">
                    {role}
                  </span>{' '}
                  no tiene permisos para acceder a esta pantalla (requiere: <code className="text-emerald-400">{allowedRoles.join(', ')}</code>).
                </>
              ) : (
                <>
                  Su cuenta está asociada a la organización{' '}
                  <strong className="text-indigo-300 font-mono">{userTenantId}</strong> y no puede acceder a los datos financieros de <strong className="text-rose-400 font-mono">{requiredTenantId}</strong>.
                </>
              )}
            </p>
          </div>

          {/* Banner de Redirección Estricta Automática */}
          {redirectCountdown !== null && (
            <div className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-2xl text-xs font-mono text-rose-200 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
              <span>
                Redirigiendo automáticamente a su panel autorizado en <strong className="text-white">{redirectCountdown}s</strong>...
              </span>
            </div>
          )}

          {/* Caja explicativa de reglas RLS */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 text-left space-y-2 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-400 font-bold">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Aislamiento Multi-Tenant & RLS Activo</span>
            </div>
            <p className="text-slate-400 text-[11px] font-sans leading-normal">
              Cada Administrador solo posee visibilidad sobre la organización asignada en su perfil (<code className="text-emerald-300">organization_id</code>). La navegación cruzada entre fondos o paneles sin rol <code className="text-amber-300">'super_admin'</code> queda estrictamente bloqueada.
            </p>
          </div>

          {/* Botones de acción manual */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                if (onUnauthorizedRedirect) {
                  if (role === 'collector' || role === 'cobrador') onUnauthorizedRedirect('collector_street');
                  else if (role === 'cliente') onUnauthorizedRedirect('client_borrower');
                  else onUnauthorizedRedirect('admin_cfo');
                }
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
            >
              Ir a Mi Panel Autorizado Ahora
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={logout}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Renderizar contenido protegido con información de contexto
  return <>{children}</>;
};
