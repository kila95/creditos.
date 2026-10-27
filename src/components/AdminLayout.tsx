import React, { useState } from 'react';
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
} from 'lucide-react';
import { RouteData, ClientProfile, LoanDetail, RouteExpenseItem, LedgerEntry, CollectorBase } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { LiquidatedHistoryView } from './LiquidatedHistoryView';
import { AdminInvestorDashboard } from './AdminInvestorDashboard';
import { CollectorUserRecord } from './AdminCollectorUsersManager';
import { SubscriptionGuard } from './SubscriptionGuard';

export type AdminLayoutTab =
  | 'dashboard'
  | 'gestion_cobradores'
  | 'lista_clientes'
  | 'liquidated_history'
  | 'scoring_riesgo'
  | 'cierre_caja'
  | 'simulador_cfo'
  | 'auditoria';

interface AdminLayoutProps {
  routes: RouteData[];
  clients: ClientProfile[];
  loans: LoanDetail[];
  expenses: RouteExpenseItem[];
  ledger: LedgerEntry[];
  collectorBases?: CollectorBase[];
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
  const { profile, role } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminLayoutTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  const tenantId = profile?.organizationId || 'org-medellin-01';

  return (
    <SubscriptionGuard>
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

          {activeTab !== 'liquidated_history' && (
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
    </SubscriptionGuard>
  );
};
