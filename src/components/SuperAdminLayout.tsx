import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  ShieldCheck, 
  CreditCard, 
  LogOut, 
  Menu, 
  X, 
  Crown, 
  Server, 
  Activity, 
  DollarSign,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SuperAdminTenantsManager } from './SuperAdminTenantsManager';
import { SuperAdminSubscriptionsManager } from './SuperAdminSubscriptionsManager';
import { SuperAdminWhatsAppCollectionCenter } from './SuperAdminWhatsAppCollectionCenter';
import { AuditLogView } from './AuditLogView';
import { GestionarSuscripcionView } from './GestionarSuscripcionView';
import { INITIAL_AUDIT_LOGS } from '../data/auditLogData';
import { formatCOP } from '../utils/financialCalculations';

export type SuperAdminTab = 'dashboard' | 'admins' | 'audit' | 'subscriptions' | 'whatsapp' | 'suscripcion_wompi';

export const SuperAdminLayout: React.FC = () => {
  const { profile, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Estadísticas globales de prueba para el dashboard SaaS
  const totalTenants = 3;
  const activeRoutesCount = 4;
  const monthlyMRR = activeRoutesCount * 180000;
  const totalGlobalPortfolio = 4500000;

  const navItems = [
    { id: 'dashboard' as SuperAdminTab, label: 'Métricas Globales', icon: LayoutDashboard, desc: 'KPIs del SaaS e ingresos MRR' },
    { id: 'suscripcion_wompi' as SuperAdminTab, label: 'Suscripción / Pagos (Wompi)', icon: CreditCard, desc: 'Gestionar Suscripción con Wompi' },
    { id: 'admins' as SuperAdminTab, label: 'Gestión de Administradores', icon: Users, desc: 'Aprovisionamiento de Fondos y cuentas Admin' },
    { id: 'subscriptions' as SuperAdminTab, label: 'Suscripciones y Cobros', icon: CreditCard, desc: 'Planes y estados de cobro' },
    { id: 'whatsapp' as SuperAdminTab, label: 'Cobranza WhatsApp', icon: MessageSquare, desc: 'Avisos de mora, bloqueo y vencimiento' },
    { id: 'audit' as SuperAdminTab, label: 'Auditoría de Seguridad', icon: ShieldCheck, desc: 'Trazabilidad SHA-256' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Botón menú móvil */}
      <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-bold shadow-md">
            <Crown className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm text-white">Super Admin OS</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg bg-slate-800 text-slate-200"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Menú lateral (Sidebar) Escritorio */}
      <aside className={`hidden md:flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-72'}`}>
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
          {!isCollapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 font-bold shadow-lg">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-sm text-white tracking-tight">RutaCapital SaaS</h1>
                <p className="text-[10px] text-amber-400 font-mono">Super Admin Global</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white mx-auto"
            title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-800 bg-slate-950/40">
          {!isCollapsed ? (
            <div>
              <p className="text-xs font-bold text-white truncate">{profile?.fullName || 'Esteban Ochoa'}</p>
              <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">{profile?.email || 'estebanochoamesa@gmail.com'}</p>
            </div>
          ) : (
            <div className="text-center font-bold text-xs text-amber-400">SA</div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-white border-l-4 border-amber-500 shadow-md shadow-amber-950/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                {!isCollapsed && (
                  <div className="text-left min-w-0 flex-1">
                    <div className="truncate">{item.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal truncate">{item.desc}</div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={logout}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 text-rose-200 border border-rose-800/50 transition-colors ${
              isCollapsed ? 'justify-center px-0' : ''
            }`}
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* Menú móvil desplegable */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 bg-slate-900 border-r border-slate-800 flex flex-col justify-between z-10 shadow-2xl">
            <div>
              <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold">
                    <Crown className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-sm text-white">Super Admin OS</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="p-3 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-semibold ${
                        isActive ? 'bg-slate-800 text-white border-l-4 border-amber-500' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-amber-400' : ''}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="p-4 border-t border-slate-800">
              <button
                onClick={logout}
                className="w-full py-2.5 bg-rose-950/80 text-rose-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenido Principal */}
      <main className="flex-1 bg-slate-950 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/50 border border-indigo-500/30 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500 text-slate-950 uppercase tracking-wider">
                      SaaS Global Core
                    </span>
                    <span className="text-xs text-slate-400 font-mono">Zero-Trust Architecture</span>
                  </div>
                  <h1 className="text-2xl font-bold text-white mt-2 flex items-center gap-2">
                    <Crown className="w-6 h-6 text-amber-400" />
                    Consola del Super Administrador
                  </h1>
                  <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    Monitoreo en tiempo real de la infraestructura multi-inquilino (tenants), rendimiento financiero global y trazabilidad de seguridad.
                  </p>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-right">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Base de Datos / Cloud SQL</div>
                  <div className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>PostgreSQL Operacional</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tarjetas de Métricas Clave */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Inquilinos (Tenants)</span>
                  <Building2 className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">{totalTenants}</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                  <span>+1 este mes</span>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Rutas Activas SaaS</span>
                  <Activity className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">{activeRoutesCount}</div>
                <div className="text-[11px] text-slate-400 mt-1">Facturación activa</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">MRR (Ingreso Mensual)</span>
                  <DollarSign className="w-5 h-5 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">{formatCOP(monthlyMRR)}</div>
                <div className="text-[11px] text-emerald-400 mt-1">100% Recaudado</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Portafolio Global</span>
                  <Server className="w-5 h-5 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">{formatCOP(totalGlobalPortfolio)}</div>
                <div className="text-[11px] text-slate-400 mt-1">Multi-Tenant RLS</div>
              </div>
            </div>

            {/* Vista previa rápida de gestión de tenants */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">Inquilinos y Fondos Activos</h2>
                  <p className="text-xs text-slate-400">Resumen rápido de las organizaciones conectadas a la plataforma</p>
                </div>
                <button
                  onClick={() => setActiveTab('admins')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Gestionar Administradores
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <div className="font-bold text-sm text-white">Fondo Medellín Central</div>
                  <div className="text-xs text-slate-400 mt-1">Admin: Carlos Andrés Vélez</div>
                  <div className="text-xs text-emerald-400 font-mono mt-2">ID: org-medellin-01</div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <div className="font-bold text-sm text-white">Fondo Norte & Bello</div>
                  <div className="text-xs text-slate-400 mt-1">Admin: Jorge Iván Montoya</div>
                  <div className="text-xs text-emerald-400 font-mono mt-2">ID: org-norte-02</div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <div className="font-bold text-sm text-white">Inversiones del Cauca</div>
                  <div className="text-xs text-slate-400 mt-1">Admin: Felipe Álvarez</div>
                  <div className="text-xs text-emerald-400 font-mono mt-2">ID: org-occidente-03</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admins' && <SuperAdminTenantsManager />}
        {activeTab === 'audit' && <AuditLogView logs={INITIAL_AUDIT_LOGS} />}
        {activeTab === 'subscriptions' && (
          <SuperAdminSubscriptionsManager
            onOpenWhatsAppCenter={() => setActiveTab('whatsapp')}
          />
        )}
        {activeTab === 'whatsapp' && (
          <SuperAdminWhatsAppCollectionCenter
            onNavigateToSubscriptions={() => setActiveTab('subscriptions')}
          />
        )}
        {activeTab === 'suscripcion_wompi' && (
          <GestionarSuscripcionView />
        )}
      </main>
    </div>
  );
};
