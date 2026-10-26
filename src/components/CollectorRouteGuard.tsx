import React from 'react';
import { 
  Bike, 
  Lock, 
  LogOut, 
  MapPin, 
  ShieldAlert, 
  RefreshCw,
  Crown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CollectorLoginView } from './CollectorLoginView';
import { RouteData } from '../data/mockData';

interface CollectorRouteGuardProps {
  children: (props: { activeRouteId: string; isSupervisingAdmin: boolean }) => React.ReactNode;
  routes: RouteData[];
  onSelectSupervisedRoute?: (routeId: string) => void;
}

export const CollectorRouteGuard: React.FC<CollectorRouteGuardProps> = ({ 
  children, 
  routes,
  onSelectSupervisedRoute
}) => {
  const { isAuthenticated, role, isSuperAdmin, isAdmin, isSocio, isCollector, profile, loading, logout, switchDemoUser } = useAuth();
  const [supervisedRouteId, setSupervisedRouteId] = React.useState<string>('route-1');

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-spin">
          <RefreshCw className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-white">Validando Credenciales y Ruta Asignada (Rol: collector)...</p>
        <p className="text-xs text-slate-400 font-mono">SELECT assigned_route_id, organization_id FROM public.profiles WHERE id = auth.uid()</p>
      </div>
    );
  }

  // Si no está autenticado -> Mostrar la pantalla de login móvil de cobrador
  if (!isAuthenticated) {
    return (
      <div className="py-2">
        <CollectorLoginView message="Debes identificarte con tu usuario 'collector' para iniciar el recorrido de cobro." />
      </div>
    );
  }

  // Si el usuario es un cliente -> Bloquear acceso
  if (role === 'cliente') {
    return (
      <div className="max-w-md mx-auto py-8 px-4 text-center">
        <div className="bg-slate-900 border-2 border-rose-500/40 rounded-3xl p-6 shadow-2xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300">
              Acceso No Autorizado (Rol: Cliente)
            </span>
            <h3 className="text-lg font-bold text-white mt-1">Terminal Exclusiva para Cobradores ('collector')</h3>
            <p className="text-xs text-slate-300 mt-1">
              Tu cuenta de deudor no tiene permisos para acceder al sistema operativo de cobro en calle.
            </p>
          </div>
          <button
            onClick={() => switchDemoUser('cobrador@rutacapital.co')}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
          >
            Iniciar como Collector Autorizado
          </button>
        </div>
      </div>
    );
  }

  // DETERMINACIÓN DE LA RUTA ACTIVA:
  // Si es collector / cobrador: ESTRICTAMENTE su ruta asignada (imposible ver otra ruta por RLS)
  // Si es super_admin / admin / socio: Puede supervisar las rutas de su organización
  const isSupervisingAdmin = isSuperAdmin || isAdmin || isSocio;
  const effectiveRouteId = isSupervisingAdmin
    ? supervisedRouteId 
    : (profile?.assignedRouteId || 'route-1');

  const currentRoute = routes.find(r => r.id === effectiveRouteId) || routes[0];

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR DE CONTEXTO DEL COBRADOR EN CALLE */}
      <div className="bg-slate-900 border-2 border-emerald-500/30 rounded-2xl p-3 sm:px-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 border border-emerald-400 flex items-center justify-center text-white shrink-0 shadow-md">
            <Bike className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm font-black text-white truncate">
                {profile?.fullName}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {isCollector ? `NIVEL 3: COLLECTOR` : isSuperAdmin ? 'NIVEL 1: SUPER_ADMIN' : 'NIVEL 2: ADMIN'}
              </span>
              {profile?.organizationId && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Org: {profile.organizationId}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-300 mt-0.5">
              <MapPin className="w-3 h-3 text-emerald-400" />
              <strong className="text-emerald-300">{currentRoute.name}</strong>
              <span className="text-slate-400">({currentRoute.code})</span>
            </div>
          </div>
        </div>

        {/* ACCIONES Y SELECTOR DE SUPERVISIÓN */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {isSupervisingAdmin && (
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
              <span className="text-slate-400 px-1.5 hidden md:inline text-[10px]">Supervisar:</span>
              {routes.map(r => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSupervisedRouteId(r.id);
                    if (onSelectSupervisedRoute) onSelectSupervisedRoute(r.id);
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    effectiveRouteId === r.id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r.code.split('-')[2] || r.name.slice(0, 10)}
                </button>
              ))}
            </div>
          )}

          {isCollector && (
            <div className="bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 text-[11px] font-mono text-emerald-400 flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-400" />
              <span>Ruta Aislada RLS</span>
            </div>
          )}

          <button
            onClick={logout}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs font-semibold transition-all"
            title="Cerrar turno y salir"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cerrar Turno</span>
          </button>
        </div>
      </div>

      {/* RENDERIZADO DE LA INTERFAZ DE CALLE CON LA RUTA ESTRICTAMENTE AISLADA */}
      {children({ activeRouteId: effectiveRouteId, isSupervisingAdmin })}
    </div>
  );
};
