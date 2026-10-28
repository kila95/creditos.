import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CheckCircle2,
  BrainCircuit,
  FileCheck,
  Calculator,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Receipt,
  CreditCard,
} from 'lucide-react';
import { RouteData, ClientProfile, LoanDetail, RouteExpenseItem, LedgerEntry, CollectorBase } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { LiquidatedHistoryView } from './LiquidatedHistoryView';
import { AdminInvestorDashboard } from './AdminInvestorDashboard';
import { CollectorUserRecord } from './AdminCollectorUsersManager';
import { SubscriptionPaywall } from './SubscriptionPaywall';
import { HistorialPagos } from './HistorialPagos';
import { GestionarSuscripcionView } from './GestionarSuscripcionView';
import { GpsAuditTrackerModule } from './GpsAuditTrackerModule';
import { WhatsAppCloudTriggerModule } from './WhatsAppCloudTriggerModule';
import { OverduePenaltyCronModule } from './OverduePenaltyCronModule';
import { BulkImport } from './BulkImport';
import { MapPin, MessageCircle, Clock, FileSpreadsheet } from 'lucide-react';

export type AdminLayoutTab =
  | 'dashboard'
  | 'gestion_cobradores'
  | 'lista_clientes'
  | 'liquidated_history'
  | 'scoring_riesgo'
  | 'cierre_caja'
  | 'simulador_cfo'
  | 'auditoria'
  | 'auditoria_gps'
  | 'whatsapp_cloud_api'
  | 'pg_cron_mora'
  | 'importacion_masiva'
  | 'historial_pagos'
  | 'suscripcion';

interface AdminLayoutProps {
  routes: RouteData[];
  clients: ClientProfile[];
  loans: LoanDetail[];
  expenses: RouteExpenseItem[];
  ledger: LedgerEntry[];
  collectorBases?: CollectorBase[];
  isSubscriptionActive?: boolean;
  onAssignCollectorBase?: (newBase: CollectorBase) => Promise<void> | void;
  onUpdateCollectorBaseStatus?: (baseId: string, status: 'ACTIVA' | 'DEVUELTA') => Promise<void> | void;
  onCollectorCreated?: (collector: CollectorUserRecord) => void;
  onRestructureLoan: (loanId: string) => void;
  onToggleClientBlock: (clientId: string) => void;
  onReassignClientRoute: (clientId: string, newRouteId: string) => void;
  onConfirmReconciliation: (routeId: string, actualCash: number, discrepancy: number, notes: string, sessionRecord?: any) => void;
  onOpenNewClientModal?: () => void;
  logout: () => Promise<void>;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  routes,
  clients,
  loans,
  expenses,
  ledger,
  collectorBases = [],
  isSubscriptionActive: isSubscriptionActiveProp,
  onAssignCollectorBase,
  onUpdateCollectorBaseStatus,
  onCollectorCreated,
  onRestructureLoan,
  onToggleClientBlock,
  onReassignClientRoute,
  onConfirmReconciliation,
  onOpenNewClientModal,
  logout,
}) => {
  const { user, profile, role, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminLayoutTab>(() =>
    typeof window !== 'undefined' && window.location.pathname === '/admin/suscripcion'
      ? 'suscripcion'
      : 'dashboard'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isSubscriptionActive, setIsSubscriptionActive] = useState<boolean>(
    isSubscriptionActiveProp ?? true
  );

  const navigateTab = (tab: AdminLayoutTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      const targetPath = tab === 'suscripcion' ? '/admin/suscripcion' : '/admin';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    }
  };

  const tenantId = profile?.organizationId || user?.id || 'org-medellin-01';

  useEffect(() => {
    if (typeof isSubscriptionActiveProp === 'boolean') {
      setIsSubscriptionActive(isSubscriptionActiveProp);
      return;
    }
    if (isSuperAdmin) {
      setIsSubscriptionActive(true);
      return;
    }

    let mounted = true;
    supabase
      .from('tenant_subscriptions')
      .select('status, trial_end')
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted && data && data.status) {
          const isTrialValid =
            data.status === 'trialing' &&
            Boolean(data.trial_end && new Date(data.trial_end).getTime() > Date.now());
          setIsSubscriptionActive(data.status === 'active' || isTrialValid);
        }
      });

    return () => {
      mounted = false;
    };
  }, [tenantId, isSubscriptionActiveProp, isSuperAdmin]);

  // Bloqueo Condicional (Paywall): Si la suscripción no está activa, oculta el panel y renderiza solo el botón de pago de Wompi
  if (!isSubscriptionActive && !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm font-bold">
              RC
            </div>
            <div>
              <h2 className="text-white font-bold text-sm tracking-tight">
                {profile?.fullName || 'Administrador'}
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Tenant: <span className="text-amber-400 font-semibold">{tenantId}</span> · Suscripción Inactiva
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/60 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </header>
        <SubscriptionPaywall
          tenantId={tenantId}
          customerEmail={profile?.email || user?.email}
          customerName={profile?.fullName}
          onSubscriptionActivated={() => setIsSubscriptionActive(true)}
        />
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* HEADER SUPERIOR */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm font-bold">
            RC
          </div>
          <div>
            <h2 className="text-white font-bold text-sm tracking-tight">{profile?.fullName || 'Administrador'}</h2>
            <p className="text-[11px] text-slate-400 font-mono">
              Rol: <span className="text-emerald-400 font-semibold">{role?.toUpperCase()}</span> · {profile?.organizationName || 'RutaCapital'}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/60 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
          title="Cerrar sesión de forma segura"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Cerrar Sesión</span>
        </button>
      </header>

      {/* CUERPO CON SIDEBAR Y ÁREA PRINCIPAL */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* MENÚ LATERAL (SIDEBAR) */}
        <aside
          className={`${
            mobileMenuOpen ? 'block fixed inset-y-0 left-0 z-50 shadow-2xl' : 'hidden'
          } lg:block bg-slate-900 border-r border-slate-800 w-72 shrink-0 flex flex-col justify-between transition-all duration-300`}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Navegación Admin
              </span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:block p-1 text-slate-400 hover:text-white"
              >
                {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>

            <nav className="space-y-1.5">
              {/* 1. Dashboard General */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('dashboard');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>1. Dashboard General</span>
              </button>

              {/* 2. Gestión de Rutas y Cobradores */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('gestion_cobradores');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'gestion_cobradores'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>2. Gestión de Cobradores & Rutas</span>
              </button>

              {/* 3. Lista de Clientes */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('lista_clientes');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'lista_clientes'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                <span>3. Lista de Clientes & Créditos</span>
              </button>

              {/* 4. HISTORIAL LIQUIDADOS (Debajo de gestión de rutas y clientes) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('liquidated_history');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'liquidated_history'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>4. Historial Liquidados</span>
              </button>

              {/* 5. Scoring & Alertas PAR 30 */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('scoring_riesgo');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'scoring_riesgo'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <BrainCircuit className="w-4 h-4 shrink-0" />
                <span>5. Scoring & Alertas PAR 30</span>
              </button>

              {/* 6. Monitoreo de Rutas & Arqueos */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('cierre_caja');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'cierre_caja'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <FileCheck className="w-4 h-4 shrink-0" />
                <span>6. Monitoreo de Rutas & Arqueos</span>
              </button>

              {/* 7. Simulador Financiero TEA */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('simulador_cfo');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'simulador_cfo'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Calculator className="w-4 h-4 shrink-0" />
                <span>7. Simulador Financiero TEA</span>
              </button>

              {/* 8. Bitácora SHA-256 */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('auditoria');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'auditoria'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>8. Bitácora SHA-256</span>
              </button>

              {/* 8.5. Auditoría GPS (Rastreo Satelital) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('auditoria_gps');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'auditoria_gps'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <MapPin className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Auditoría GPS (Mapa)</span>
              </button>

              {/* 8.6. WhatsApp Automático (Meta Cloud API + Triggers) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('whatsapp_cloud_api');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'whatsapp_cloud_api'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <MessageCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>WhatsApp Cloud (Triggers)</span>
              </button>

              {/* 8.7. Mora Automática (Postgres pg_cron) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('pg_cron_mora');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'pg_cron_mora'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Clock className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Mora Automática (pg_cron)</span>
              </button>

              {/* 8.8. Importación Masiva (CSV / Excel) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('importacion_masiva');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'importacion_masiva'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Importación Masiva (CSV)</span>
              </button>

              {/* 9. Historial de Pagos (Facturación Wompi) */}
              <button
                type="button"
                onClick={() => navigateTab('historial_pagos')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'historial_pagos'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Receipt className="w-4 h-4 shrink-0" />
                <span>9. Historial de Pagos</span>
              </button>

              {/* 10. Suscripción y Pagos (/admin/suscripcion) */}
              <button
                type="button"
                onClick={() => navigateTab('suscripcion')}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  activeTab === 'suscripcion'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg'
                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50 hover:text-white'
                }`}
              >
                <CreditCard className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Suscripción y Pagos (Wompi)</span>
              </button>
            </nav>
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-[11px] font-mono text-slate-400">
            Tenant: <span className="text-emerald-400 font-semibold">{tenantId}</span>
          </div>
        </aside>

        {/* ÁREA PRINCIPAL CENTRAL (Renderizado Condicional) */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {activeTab === 'liquidated_history' && (
            <LiquidatedHistoryView
              organizationId={tenantId}
              loans={loans}
              clients={clients}
              routes={routes}
              onOpenNewClientModal={onOpenNewClientModal}
            />
          )}

          {activeTab === 'historial_pagos' && (
            <HistorialPagos tenantId={tenantId} />
          )}

          {activeTab === 'suscripcion' && (
            <GestionarSuscripcionView
              tenantId={tenantId}
              onSubscriptionActivated={() => setIsSubscriptionActive(true)}
            />
          )}

          {activeTab === 'auditoria_gps' && (
            <GpsAuditTrackerModule
              routes={routes}
              clients={clients}
              loans={loans}
              ledger={ledger}
            />
          )}

          {activeTab === 'whatsapp_cloud_api' && (
            <WhatsAppCloudTriggerModule
              clients={clients}
              loans={loans}
              ledger={ledger}
            />
          )}

          {activeTab === 'pg_cron_mora' && (
            <OverduePenaltyCronModule
              clients={clients}
              loans={loans}
            />
          )}

          {activeTab === 'importacion_masiva' && (
            <BulkImport />
          )}

          {activeTab !== 'liquidated_history' &&
            activeTab !== 'historial_pagos' &&
            activeTab !== 'suscripcion' &&
            activeTab !== 'auditoria_gps' &&
            activeTab !== 'whatsapp_cloud_api' &&
            activeTab !== 'pg_cron_mora' &&
            activeTab !== 'importacion_masiva' && (
            <AdminInvestorDashboard
              routes={routes}
              clients={clients}
              loans={loans}
              expenses={expenses}
              ledger={ledger}
              collectorBases={collectorBases}
              onAssignCollectorBase={onAssignCollectorBase}
              onUpdateCollectorBaseStatus={onUpdateCollectorBaseStatus}
              onCollectorCreated={onCollectorCreated}
              onRestructureLoan={onRestructureLoan}
              onToggleClientBlock={onToggleClientBlock}
              onReassignClientRoute={onReassignClientRoute}
              onConfirmReconciliation={onConfirmReconciliation}
              onOpenNewClientModal={onOpenNewClientModal}
            />
          )}
        </main>
      </div>
    </div>
  );
};
