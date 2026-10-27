import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Crown,
  Lock,
  Building2,
  DollarSign,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Server,
  Zap,
  Layers,
  ArrowUpRight,
  Download,
  Calendar,
  KeyRound,
  Database
} from 'lucide-react';
import { SuperAdminTenantsManager } from './SuperAdminTenantsManager';
import { AuditLogView } from './AuditLogView';
import { SuperAdminPaymentApprovalView } from './SuperAdminPaymentApprovalView';
import { INITIAL_AUDIT_LOGS, AuditLogItem } from '../data/auditLogData';
import { formatCOP } from '../utils/financialCalculations';
import { useAuth } from '../context/AuthContext';

export type SuperAdminTab = 'dashboard' | 'admins' | 'audit' | 'subscriptions';

interface NavOption {
  id: SuperAdminTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SUPER_ADMIN_NAV_OPTIONS: NavOption[] = [
  {
    id: 'dashboard',
    label: 'Dashboard (Métricas Globales)',
    description: 'KPIs del SaaS, rutas activas e ingresos MRR',
    icon: LayoutDashboard,
  },
  {
    id: 'admins',
    label: 'Gestión de Administradores',
    description: 'Aprovisionamiento de Fondos y cuentas Admin',
    icon: Users,
  },
  {
    id: 'audit',
    label: 'Auditoría del Sistema',
    description: 'Trazabilidad SHA-256 e historial inmutable',
    icon: ShieldCheck,
  },
  {
    id: 'subscriptions',
    label: 'Configuración de Suscripciones',
    description: 'Planes por ruta, tarifas COP y estado de cobro',
    icon: CreditCard,
  },
];

export const SuperAdminDashboardView: React.FC = () => {
  const { profile } = useAuth();

  // Estado para la navegación "pantalla por pantalla"
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('dashboard');

  // Estado para el Sidebar colapsable en escritorio
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Estado para el menú hamburguesa en móviles
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Estado de planes de suscripción para la pestaña Subscriptions
  const [feePerRoute, setFeePerRoute] = useState<number>(180000);
  const [billingCycle, setBillingCycle] = useState<'mensual' | 'anual'>('mensual');

  // Datos simulados de facturación de inquilinos
  const tenantSubscriptionData = [
    {
      tenantId: 'org-medellin-01',
      organizationName: 'Fondo RutaCapital Medellín Central',
      adminName: 'Carlos Andrés Vélez',
      adminEmail: 'admin@rutacapital.co',
      activeRoutes: 1,
      totalPortfolioCOP: 1200000,
      planName: 'Plan Pro (Por Ruta)',
      monthlyFeeCOP: 180000,
      paymentStatus: 'al_dia',
      nextBillingDate: '2026-11-05',
    },
    {
      tenantId: 'org-norte-02',
      organizationName: 'Fondo Microcrédito Bello & Norte',
      adminName: 'Jorge Iván Montoya',
      adminEmail: 'admin2@rutacapital.co',
      activeRoutes: 1,
      totalPortfolioCOP: 900000,
      planName: 'Plan Pro (Por Ruta)',
      monthlyFeeCOP: 180000,
      paymentStatus: 'al_dia',
      nextBillingDate: '2026-11-10',
    },
    {
      tenantId: 'org-occidente-03',
      organizationName: 'Inversiones del Cauca & Sur',
      adminName: 'Felipe Álvarez',
      adminEmail: 'siux95.eo@gmail.com',
      activeRoutes: 2,
      totalPortfolioCOP: 2400000,
      planName: 'Plan Enterprise',
      monthlyFeeCOP: 360000,
      paymentStatus: 'pendiente',
      nextBillingDate: '2026-10-30',
    },
  ];

  const totalActiveRoutes = tenantSubscriptionData.reduce((sum, t) => sum + t.activeRoutes, 0);
  const totalMonthlyMRR = totalActiveRoutes * feePerRoute;

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            {/* Banner superior de bienvenida para el Super Admin */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-indigo-500/30 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500 text-slate-950 uppercase tracking-wider">
                      Plataforma SaaS Core
                    </span>
                    <span className="text-xs text-slate-400 font-mono">Versión 3.5 · Zero-Trust RLS</span>
                  </div>
                  <h1 className="text-2xl font-bold text-white mt-2 flex items-center gap-2">
                    <Crown className="w-6 h-6 text-amber-400 shrink-0" />
                    Consola del Super Administrador Global
                  </h1>
                  <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    Monitoreo en tiempo real de la infraestructura multi-inquilino, rendimiento de suscripciones por rutas activas e integridad de la base de datos PostgreSQL.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Servidores / Cloud SQL</div>
                    <div className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Operacional (US-West1)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid de 4 KPIs SaaS Principales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-indigo-500/40 transition-all">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Inquilinos (Fondos Activos)</span>
                  <Building2 className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2 font-mono tabular-nums">
                  {tenantSubscriptionData.length}
                </div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Organizaciones con RLS</span>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-emerald-500/40 transition-all">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Rutas de Cobro Activas</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono tabular-nums">
                  {totalActiveRoutes}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Base de cobro: {formatCOP(feePerRoute)} / ruta
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-amber-500/40 transition-all">
                <div className="flex items-center justify-between text-amber-300 text-xs font-medium">
                  <span>Ingresos Mensuales MRR (SaaS)</span>
                  <DollarSign className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-amber-300 mt-2 font-mono tabular-nums">
                  {formatCOP(totalMonthlyMRR)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Proyección anual: {formatCOP(totalMonthlyMRR * 12)}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-rose-500/40 transition-all">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Protección Criptográfica</span>
                  <Lock className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-base font-bold text-rose-300 mt-2 font-mono">
                  ZERO-TRUST RLS
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Super Admin sin acceso a saldo de clientes
                </div>
              </div>
            </div>

            {/* Resumen de Inquilinos y Distribución */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-400" />
                    Resumen de Organizaciones & Inquilinos
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Fondos administrados por el sistema y rutas facturables asociadas
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('admins')}
                  className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Aprovisionar Nuevo Admin</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                      <th className="py-3 px-4">Organización / Fondo</th>
                      <th className="py-3 px-4">Administrador Encargado</th>
                      <th className="py-3 px-4">Tenant ID</th>
                      <th className="py-3 px-4">Rutas Activas</th>
                      <th className="py-3 px-4">Cobro SaaS Mensual</th>
                      <th className="py-3 px-4">Acciones de Soporte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {tenantSubscriptionData.map((tenant) => (
                      <tr key={tenant.tenantId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {tenant.organizationName}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          <div>{tenant.adminName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{tenant.adminEmail}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-amber-300">
                          {tenant.tenantId}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                          {tenant.activeRoutes} ruta(s)
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-white">
                          {formatCOP(tenant.monthlyFeeCOP)}
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => alert(`Para auditar el inquilino, cierre sesión e ingrese como ${tenant.adminEmail}`)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-indigo-900/60 text-indigo-300 border border-slate-700 hover:border-indigo-500/50 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <KeyRound className="w-3 h-3" />
                            <span>Inspeccionar</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'admins':
        return <SuperAdminTenantsManager />;

      case 'audit':
        return (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  Bitácora de Auditoría e Integridad del Sistema
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Registros inmutables con firma hash SHA-256 de todas las acciones administrativas y operativas
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Cadena Hash Inmutable: VERIFICADA
                </span>
              </div>
            </div>

            <AuditLogView logs={INITIAL_AUDIT_LOGS} />
          </div>
        );

      case 'subscriptions':
        return (
          <div className="space-y-6">
            <SuperAdminPaymentApprovalView />
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                <div>
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                    Modelo Comercial SaaS
                  </span>
                  <h2 className="text-xl font-bold text-white mt-1.5 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-400" />
                    Configuración de Suscripciones y Tarifas por Ruta
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Definición de cobro mensual en Pesos Colombianos (COP) por cada ruta de cobro activa en la plataforma
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Tarifa actual por ruta:</span>
                  <div className="text-lg font-bold font-mono text-emerald-400 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
                    {formatCOP(feePerRoute)} / mes
                  </div>
                </div>
              </div>

              {/* Ajuste de Parámetros de Suscripción */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    Tarifa Base por Ruta Activa (COP):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500">$</span>
                    <input
                      type="number"
                      value={feePerRoute}
                      onChange={(e) => setFeePerRoute(Number(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-7 pr-3 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Se cobra automáticamente al final de cada ciclo de facturación
                  </p>
                </div>

                <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    Ciclo de Cobro Predeterminado:
                  </label>
                  <select
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="mensual">Mensual (30 días)</option>
                    <option value="anual">Anual (Descuento del 10%)</option>
                  </select>
                  <p className="text-[11px] text-slate-500">
                    Sincronización automática de facturas en PDF
                  </p>
                </div>

                <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-300 block">
                      Ingreso Recurrente Proyectado (MRR):
                    </span>
                    <div className="text-2xl font-bold font-mono text-amber-300 mt-1">
                      {formatCOP(totalActiveRoutes * feePerRoute)}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Basado en {totalActiveRoutes} rutas activas contratadas
                  </div>
                </div>
              </div>

              {/* Tabla de Inquilinos y Suscripciones */}
              <div className="mt-6 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 bg-slate-950 border-b border-slate-800 font-bold text-xs text-white">
                  Estado de Facturación de Inquilinos
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                        <th className="py-3 px-4">Organización</th>
                        <th className="py-3 px-4">Plan Actual</th>
                        <th className="py-3 px-4">Rutas Contratadas</th>
                        <th className="py-3 px-4">Total Mensual</th>
                        <th className="py-3 px-4">Estado Pago</th>
                        <th className="py-3 px-4">Próximo Cobro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {tenantSubscriptionData.map((t) => (
                        <tr key={t.tenantId} className="hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-semibold text-white">
                            {t.organizationName}
                          </td>
                          <td className="py-3 px-4 text-slate-300">{t.planName}</td>
                          <td className="py-3 px-4 font-mono font-bold text-indigo-400">
                            {t.activeRoutes}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            {formatCOP(t.activeRoutes * feePerRoute)}
                          </td>
                          <td className="py-3 px-4">
                            {t.paymentStatus === 'al_dia' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                AL DÍA
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                PENDIENTE
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400">
                            {t.nextBillingDate}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans">
      {/* =====================================================================
          1. BARRA SUPERIOR PARA MÓVILES (CON BOTÓN HAMBURGUESA)
         ===================================================================== */}
      <header className="md:hidden sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:text-white border border-slate-700 shrink-0 cursor-pointer"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold shadow-xs">
              <Crown className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-white tracking-tight">Super Admin</span>
          </div>
        </div>

        <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
          SAAS HQ
        </span>
      </header>

      {/* =====================================================================
          2. SIDEBAR RESPONSIVO Y COLAPSABLE EN ESCRITORIO (bg-slate-900)
         ===================================================================== */}
      <aside
        className={`hidden md:flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 z-30 select-none ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Cabecera del Sidebar con Botón Toggle */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <h2 className="font-bold text-sm text-white truncate tracking-tight">
                  Super Admin
                </h2>
                <p className="text-[10px] font-mono text-slate-400 truncate">
                  RutaCapital SaaS
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/80 transition-colors cursor-pointer shrink-0"
            title={isCollapsed ? 'Desplegar menú' : 'Colapsar menú'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Resumen del perfil en el Sidebar */}
        {!isCollapsed && (
          <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold shrink-0 text-xs">
                SA
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">
                  {profile?.fullName || 'Esteban Ochoa'}
                </p>
                <p className="text-[10px] text-amber-400 font-mono truncate">
                  super_admin (Holding)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navegación Principal con Borde de Resaltado Lateral border-indigo-500 */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {SUPER_ADMIN_NAV_OPTIONS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-semibold transition-all duration-300 cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-white border-l-4 border-indigo-500 shadow-md shadow-indigo-950/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 transition-colors ${
                    isActive ? 'text-indigo-400' : 'text-slate-400'
                  }`}
                />

                {!isCollapsed && (
                  <div className="text-left min-w-0 flex-1">
                    <div className="truncate">{item.label}</div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer del Sidebar */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 shrink-0">
          {!isCollapsed ? (
            <div className="text-[10px] font-mono text-slate-500 text-center">
              RutaCapital OS v3.5 · SaaS Core
            </div>
          ) : (
            <div className="flex justify-center">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
          )}
        </div>
      </aside>

      {/* =====================================================================
          3. MENÚ DESPLEGABLE FLUIDO EN CELULARES (MÓVILES)
         ===================================================================== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div className="relative w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 flex flex-col justify-between z-10 shadow-2xl">
            <div>
              <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold">
                    <Crown className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-sm text-white">Super Admin Panel</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 border-b border-slate-800 bg-slate-950/50">
                <p className="text-xs font-bold text-white truncate">
                  {profile?.fullName || 'Super Admin'}
                </p>
                <p className="text-[11px] text-amber-400 font-mono mt-0.5">
                  superadmin@rutacapital.co
                </p>
              </div>

              <nav className="p-3 space-y-1">
                {SUPER_ADMIN_NAV_OPTIONS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-slate-800 text-white border-l-4 border-indigo-500 shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                      }`}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-indigo-400' : ''}`} />
                      <div className="text-left min-w-0">
                        <div className="truncate">{item.label}</div>
                        <div className="text-[10px] text-slate-500 font-normal truncate">
                          {item.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 text-center">
              <span className="text-[10px] font-mono text-slate-500">
                RutaCapital SaaS · Zero-Trust
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. ÁREA PRINCIPAL DE CONTENIDO (CONTENEDOR CENTRAL DINÁMICO)
         ===================================================================== */}
      <main className="flex-1 bg-slate-950 p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">
        {renderActiveScreen()}
      </main>
    </div>
  );
};
