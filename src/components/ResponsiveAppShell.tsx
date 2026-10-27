import React, { useState } from 'react';
import {
  Building2,
  Bike,
  UserCheck,
  Database,
  ShieldAlert,
  DollarSign,
  Users,
  Radar,
  Menu,
  X,
  LogOut,
  Crown,
  ShieldCheck,
  UserPlus,
  ChevronRight,
  Monitor,
  Tablet,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from './PWAInstallButton';

export type ActiveRole =
  | 'admin_cfo'
  | 'collector_street'
  | 'client_borrower'
  | 'investor_fund'
  | 'security_geofence'
  | 'audit_logs'
  | 'supabase_sql'
  | 'auth_portal';

export type ViewportMode = 'auto' | 'desktop' | 'tablet' | 'mobile';

interface ResponsiveAppShellProps {
  activeRole: ActiveRole;
  onSelectRole: (role: ActiveRole) => void;
  viewportMode: ViewportMode;
  onSelectViewportMode: (mode: ViewportMode) => void;
  onOpenNewClientModal?: () => void;
  children: React.ReactNode;
}

interface NavItem {
  id: ActiveRole;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'operaciones' | 'sistema';
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'admin_cfo',
    label: 'Panel Super Admin & CFO',
    shortLabel: 'Panel Admin',
    description: 'Administradores, rutas y liquidez',
    icon: Building2,
    group: 'operaciones',
  },
  {
    id: 'collector_street',
    label: 'Terminal de Calle (Rutero)',
    shortLabel: 'Rutero',
    description: 'Recaudo diario y clientes en ruta',
    icon: Bike,
    group: 'operaciones',
  },
  {
    id: 'investor_fund',
    label: 'Fondo de Socios & ROI',
    shortLabel: 'Socios',
    description: 'Participación y rendimientos',
    icon: Users,
    group: 'operaciones',
  },
  {
    id: 'client_borrower',
    label: 'Portal del Deudor & QR',
    shortLabel: 'Deudor',
    description: 'Consulta de saldo y abonos',
    icon: UserCheck,
    group: 'operaciones',
  },
  {
    id: 'security_geofence',
    label: 'Monitoreo & Geocercas',
    shortLabel: 'Geocercas',
    description: 'Control territorial GPS en vivo',
    icon: Radar,
    group: 'sistema',
  },
  {
    id: 'audit_logs',
    label: 'Auditoría General',
    shortLabel: 'Auditoría',
    description: 'Registro inmutable de eventos',
    icon: ShieldAlert,
    group: 'sistema',
  },
  {
    id: 'supabase_sql',
    label: 'Configuración SQL & RLS',
    shortLabel: 'SQL & RLS',
    description: 'Esquema y políticas de 3 niveles',
    icon: Database,
    group: 'sistema',
  },
];

export const ResponsiveAppShell: React.FC<ResponsiveAppShellProps> = ({
  activeRole,
  onSelectRole,
  viewportMode,
  onSelectViewportMode,
  onOpenNewClientModal,
  children,
}) => {
  const { profile, role, isSuperAdmin, isAdmin, logout, switchDemoUser } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const currentNav = NAV_ITEMS.find((item) => item.id === activeRole) || NAV_ITEMS[0];

  const handleNavClick = (id: ActiveRole) => {
    onSelectRole(id);
    setMobileDrawerOpen(false);
  };

  const getViewportContainerClass = () => {
    switch (viewportMode) {
      case 'mobile':
        return 'max-w-md mx-auto border-x border-slate-800 bg-slate-950 min-h-screen shadow-2xl';
      case 'tablet':
        return 'max-w-3xl mx-auto border-x border-slate-800 bg-slate-950 min-h-screen shadow-2xl';
      case 'desktop':
      case 'auto':
      default:
        return 'w-full max-w-[1440px] mx-auto';
    }
  };

  const operationItems = NAV_ITEMS.filter((i) => {
    if (i.group !== 'operaciones') return false;
    if (isSuperAdmin) return i.id === 'admin_cfo';
    return true;
  }).map((item) =>
    isSuperAdmin && item.id === 'admin_cfo'
      ? {
          ...item,
          label: 'Consola Proveedor SaaS',
          shortLabel: 'Soporte SaaS',
          description: 'Facturación por rutas y soporte',
        }
      : item
  );
  const systemItems = NAV_ITEMS.filter((i) => {
    if (i.group !== 'sistema') return false;
    if (isSuperAdmin) return i.id === 'supabase_sql' || i.id === 'audit_logs';
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row font-sans">
      {/* =====================================================================
          1. SIDEBAR FIJO EN COMPUTADORES (lg:flex lg:w-64 lg:fixed lg:inset-y-0)
         ===================================================================== */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-slate-900 border-r border-slate-800 z-30 select-none">
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <DollarSign className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="font-bold text-base tracking-tight text-white whitespace-nowrap">
              RutaCapital OS
            </span>
          </div>
        </div>

        {/* Perfil Activo & Nivel Jerárquico */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isSuperAdmin
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : isAdmin
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
              }`}
            >
              {isSuperAdmin ? (
                <Crown className="w-4 h-4" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {profile?.fullName || 'Usuario Activo'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {role === 'super_admin'
                  ? 'Nivel 1 · Super Admin'
                  : role === 'admin'
                    ? 'Nivel 2 · Admin de Fondo'
                    : role === 'collector' || role === 'cobrador'
                      ? 'Nivel 3 · Collector'
                      : `Rol · ${role}`}
              </p>
            </div>
          </div>

          {profile?.organizationName && (
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate">{profile.organizationName}</span>
              <span className="font-mono text-[10px] text-slate-500 shrink-0 ml-2">
                {profile.organizationId}
              </span>
            </div>
          )}
        </div>

        {/* Enlaces de Navegación */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <p className="px-3 text-[11px] font-semibold text-slate-400 tracking-wide mb-2">
              Gestión & Operaciones
            </p>
            <div className="space-y-1">
              {operationItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeRole === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-white' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-80" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold text-slate-400 tracking-wide mb-2">
              Auditoría & Configuración
            </p>
            <div className="space-y-1">
              {systemItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeRole === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-white' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-80" />}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Selector Rápido de Jerarquía (Para Pruebas de Roles) & Cerrar Sesión */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 space-y-2.5">
          <div>
            <p className="text-[10px] font-medium text-slate-400 mb-1.5 px-1">
              Cambio Rápido de Nivel / Tenant (RLS):
            </p>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => {
                  switchDemoUser('superadmin@rutacapital.co');
                  onSelectRole('admin_cfo');
                }}
                className={`py-1.5 px-2 rounded text-[10px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  role === 'super_admin'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Super Admin (SaaS)
              </button>
              <button
                type="button"
                onClick={() => {
                  switchDemoUser('admin@rutacapital.co');
                  onSelectRole('admin_cfo');
                }}
                className={`py-1.5 px-2 rounded text-[10px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  profile?.email === 'admin@rutacapital.co'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Admin 1 (Tenant Sur)
              </button>
              <button
                type="button"
                onClick={() => {
                  switchDemoUser('admin2@rutacapital.co');
                  onSelectRole('admin_cfo');
                }}
                className={`py-1.5 px-2 rounded text-[10px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  profile?.email === 'admin2@rutacapital.co'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Admin 2 (Tenant Norte)
              </button>
              <button
                type="button"
                onClick={() => {
                  switchDemoUser('cobrador@rutacapital.co');
                  onSelectRole('collector_street');
                }}
                className={`py-1.5 px-2 rounded text-[10px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  role === 'collector' || role === 'cobrador'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Collector (Ruta 1)
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 border border-slate-800 hover:border-rose-800/50 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* =====================================================================
          2. MENÚ DESPLEGABLE MÓVIL (DRAWER HAMBURGUESA FLUIDO)
         ===================================================================== */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Panel lateral móvil */}
          <div className="relative w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 flex flex-col justify-between z-10 shadow-2xl">
            <div>
              {/* Cabecera del Drawer */}
              <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
                    <DollarSign className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <span className="font-bold text-sm text-white">RutaCapital OS</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  aria-label="Cerrar menú"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Resumen del usuario en móvil */}
              <div className="p-4 border-b border-slate-800 bg-slate-950/50">
                <p className="text-xs font-semibold text-white truncate">
                  {profile?.fullName}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Rol: <span className="text-emerald-400 font-mono">{role}</span> ·{' '}
                  <span>{profile?.organizationId || 'org-medellin-01'}</span>
                </p>
              </div>

              {/* Opciones de Navegación Móvil */}
              <nav className="p-3 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeRole === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <div className="text-left min-w-0">
                        <div className="font-semibold truncate">{item.label}</div>
                        <div
                          className={`text-[10px] truncate ${
                            isActive ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          {item.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Footer del Drawer Móvil */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 space-y-2">
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    switchDemoUser('superadmin@rutacapital.co');
                    handleNavClick('admin_cfo');
                  }}
                  className={`py-1.5 px-2 rounded text-[10px] font-semibold ${
                    role === 'super_admin'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-900 text-slate-300 border border-slate-800'
                  }`}
                >
                  Super Admin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    switchDemoUser('admin@rutacapital.co');
                    handleNavClick('admin_cfo');
                  }}
                  className={`py-1.5 px-2 rounded text-[10px] font-semibold ${
                    profile?.email === 'admin@rutacapital.co'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 text-slate-300 border border-slate-800'
                  }`}
                >
                  Admin 1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    switchDemoUser('cobrador@rutacapital.co');
                    handleNavClick('collector_street');
                  }}
                  className={`py-1.5 px-2 rounded text-[10px] font-semibold ${
                    role === 'collector' || role === 'cobrador'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-300 border border-slate-800'
                  }`}
                >
                  Collector
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  logout();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. CONTENEDOR PRINCIPAL + NAVBAR SUPERIOR CONTEXTUAL (lg:pl-64)
         ===================================================================== */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Top Navbar Contextual */}
        <header className="sticky top-0 z-20 h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Izquierda: Botón Hamburguesa (Móvil) + Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-slate-800 text-slate-200 hover:text-white border border-slate-700 shrink-0 cursor-pointer"
              aria-label="Abrir menú de navegación"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="hidden sm:inline">RutaCapital OS</span>
                <span className="hidden sm:inline" aria-hidden="true">
                  /
                </span>
                <span className="font-semibold text-white truncate">
                  {currentNav.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block truncate">
                {currentNav.description}
              </p>
            </div>
          </div>

          {/* Derecha: Simulador de Viewport + Acción Primaria */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Selector de previsualización responsive */}
            <div className="hidden xl:flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => onSelectViewportMode('auto')}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  viewportMode === 'auto'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => onSelectViewportMode('desktop')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  viewportMode === 'desktop'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor className="w-3 h-3" />
                <span>Desktop</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectViewportMode('tablet')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  viewportMode === 'tablet'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Tablet className="w-3 h-3" />
                <span>Tablet</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectViewportMode('mobile')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  viewportMode === 'mobile'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                <span>Móvil</span>
              </button>
            </div>

            {onOpenNewClientModal && isAdmin && !isSuperAdmin && (
              <button
                type="button"
                onClick={onOpenNewClientModal}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Nuevo Cliente</span>
              </button>
            )}

            <PWAInstallButton />
          </div>
        </header>

        {/* Área Principal de Contenido */}
        <main className={`flex-1 ${getViewportContainerClass()} p-4 sm:p-6 lg:p-8`}>
          {children}
        </main>

        {/* Footer Limpio */}
        <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>RutaCapital OS · Gestión Financiera y Microcrédito</span>
          <span className="font-mono text-[11px] text-slate-400">
            Sesión activa: {profile?.email || 'No autenticado'} ({role || 'invitado'})
          </span>
        </footer>
      </div>
    </div>
  );
};
