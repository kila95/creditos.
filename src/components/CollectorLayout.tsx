import React, { useState } from 'react';
import { 
  Menu, 
  X, 
  Wallet, 
  UserPlus, 
  ClipboardCheck, 
  Fuel, 
  LogOut, 
  ShieldCheck, 
  Calendar, 
  Bike,
  CheckCircle2,
  Clock,
  Smartphone
} from 'lucide-react';
import { RouteData, ClientProfile, LoanDetail, RouteExpenseItem, LedgerEntry, CollectorBase } from '../data/mockData';
import { CollectorStreetView } from './CollectorStreetView';
import { LiquidatedHistoryView } from './LiquidatedHistoryView';
import { EnRutaLogo } from './EnRutaLogo';

interface CollectorLayoutProps {
  currentRoute: RouteData;
  clients: ClientProfile[];
  loans: LoanDetail[];
  expenses: RouteExpenseItem[];
  ledger: LedgerEntry[];
  activeCollectorBase?: CollectorBase | null;
  onRegisterPayment: (loanId: string, amount: number, method: 'efectivo' | 'nequi' | 'bancolombia' | 'daviplata', notes: string) => void;
  onRegisterExpense: (category: RouteExpenseItem['category'], amount: number, description: string) => void;
  onConfirmReconciliation: (routeId: string, actualCash: number, discrepancy: number, notes: string) => void;
  onRegisterNewClient: (client: ClientProfile, loan: LoanDetail) => void;
  onCreateLoanForExistingClient: (loan: LoanDetail) => void;
  onSyncDatabase: () => Promise<void> | void;
  onOpenNewClientModal: () => void;
  logout: () => Promise<void>;
  collectorName: string;
}

export type CollectorTab = 'route_list' | 'liquidated_history' | 'shift_closing' | 'expenses';

export const CollectorLayout: React.FC<CollectorLayoutProps> = ({
  currentRoute,
  clients,
  loans,
  expenses,
  ledger,
  activeCollectorBase,
  onRegisterPayment,
  onRegisterExpense,
  onConfirmReconciliation,
  onRegisterNewClient,
  onCreateLoanForExistingClient,
  onSyncDatabase,
  onOpenNewClientModal,
  logout,
  collectorName,
}) => {
  const [activeTab, setActiveTab] = useState<CollectorTab>('route_list');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const navItems = [
    { id: 'route_list' as CollectorTab, label: 'Ruta del Día', icon: Wallet, description: 'Lista de cobros y clientes del día' },
    { id: 'liquidated_history' as CollectorTab, label: 'Historial Liquidados', icon: CheckCircle2, description: 'Créditos saldados y viabilidad de renovación' },
    { id: 'shift_closing' as CollectorTab, label: 'Cierre de Caja y Arqueo', icon: ClipboardCheck, description: 'Entrega de efectivo al Admin' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Barra superior con botón hamburguesa (Mobile-First) */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 focus:outline-none transition-colors cursor-pointer"
            aria-label="Abrir menú de navegación"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
              RC
            </div>
            <div>
              <h2 className="text-white font-bold text-xs sm:text-sm tracking-tight">{collectorName}</h2>
              <p className="text-[10px] text-emerald-400 font-mono">
                {currentRoute.name} · Cobrador
              </p>
            </div>
          </div>
        </div>

        {/* Pestañas de Navegación Rápida en Pantallas Medianas/Grandes */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('route_list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'route_list'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Ruta del Día</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('liquidated_history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'liquidated_history'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Historial Liquidados</span>
          </button>
        </div>

        <button
          onClick={logout}
          className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/60 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          title="Cerrar sesión"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </header>

      {/* Menú Desplegable (Off-Canvas Sidebar) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop con cierre al tocar fuera */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Panel Lateral deslizante */}
          <div className="relative w-80 max-w-[85vw] bg-slate-900 border-r border-slate-800 flex flex-col justify-between z-10 shadow-2xl animate-in slide-in-from-left duration-300">
            <div>
              <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-950/60">
                <EnRutaLogo size="sm" compactOnMobile={true} showSubtitle={true} />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 border-b border-slate-800 bg-slate-950/40">
                <p className="text-xs font-bold text-white truncate">{collectorName}</p>
                <p className="text-[11px] text-emerald-400 font-mono mt-0.5">Ruta Asignada: {currentRoute.name}</p>
              </div>

              {/* Opciones de Navegación Dinámica con cierre automático */}
              <nav className="p-3 space-y-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false); // Cierre automático al tocar
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30 border-l-4 border-emerald-400'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <div className="text-left min-w-0 flex-1">
                        <div className="truncate">{item.label}</div>
                        <div className={`text-[10px] font-normal truncate ${isActive ? 'text-emerald-100' : 'text-slate-500'}`}>
                          {item.description}
                        </div>
                      </div>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenNewClientModal();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-3.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all cursor-pointer"
                >
                  <UserPlus className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="text-left">
                    <div>Registrar Nuevo Cliente</div>
                    <div className="text-[10px] text-slate-500">Crear crédito en ruta</div>
                  </div>
                </button>
              </nav>
            </div>

            {/* Botón de Cerrar Sesión al final del menú */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full py-3 px-4 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/60 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión Segura</span>
              </button>
              <div className="text-[10px] font-mono text-slate-500 text-center mt-3">
                RutaCapital OS · Mobile v3.5
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Área Central de Contenido Dinámico (Renderizado Condicional) */}
      <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto overflow-y-auto">
        {activeTab === 'liquidated_history' && (
          <LiquidatedHistoryView
            organizationId={currentRoute.organizationId || 'org-medellin-01'}
            loans={loans}
            clients={clients}
            routes={[currentRoute]}
            onOpenNewClientModal={onOpenNewClientModal}
          />
        )}

        {activeTab !== 'liquidated_history' && (
          <CollectorStreetView
            currentRoute={currentRoute}
            clients={clients}
            loans={loans}
            expenses={expenses}
            ledger={ledger}
            activeCollectorBase={activeCollectorBase}
            onRegisterPayment={onRegisterPayment}
            onRegisterExpense={onRegisterExpense}
            onConfirmReconciliation={onConfirmReconciliation}
            onRegisterNewClient={onRegisterNewClient}
            onCreateLoanForExistingClient={onCreateLoanForExistingClient}
            onSyncDatabase={onSyncDatabase}
            onOpenNewClientModal={onOpenNewClientModal}
          />
        )}
      </main>
    </div>
  );
};
