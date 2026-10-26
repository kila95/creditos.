import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Bike, 
  UserCheck, 
  Database, 
  ShieldAlert, 
  DollarSign, 
  RefreshCw, 
  Layers, 
  ShieldCheck, 
  WifiOff, 
  Users, 
  Radar, 
  Wallet,
  Monitor,
  Tablet,
  Smartphone,
  Menu,
  X,
  Lock,
  LogOut,
  LogIn,
  KeyRound
} from 'lucide-react';
import { 
  INITIAL_ROUTES, 
  INITIAL_CLIENTS, 
  INITIAL_LOANS, 
  INITIAL_EXPENSES, 
  INITIAL_LEDGER,
  RouteData,
  ClientProfile,
  LoanDetail,
  RouteExpenseItem,
  LedgerEntry 
} from './data/mockData';
import { INITIAL_AUDIT_LOGS, AuditLogItem } from './data/auditLogData';
import { AdminInvestorDashboard } from './components/AdminInvestorDashboard';
import { CollectorStreetView } from './components/CollectorStreetView';
import { ClientBorrowerView } from './components/ClientBorrowerView';
import { SupabaseSqlViewer } from './components/SupabaseSqlViewer';
import { AuditLogView } from './components/AuditLogView';
import { InvestorFundView } from './components/InvestorFundView';
import { CollusionGeofenceMonitor } from './components/CollusionGeofenceMonitor';
import { PWAInstallButton } from './components/PWAInstallButton';
import { AdminRouteGuard } from './components/AdminRouteGuard';
import { AdminLoginView } from './components/AdminLoginView';
import { CollectorRouteGuard } from './components/CollectorRouteGuard';
import { CollectorLoginView } from './components/CollectorLoginView';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useOnlineStatus, syncOfflineQueueWithServer, enqueueOfflinePayment } from './utils/offlineSync';

export type ActiveRole = 
  | 'admin_cfo' 
  | 'collector_street' 
  | 'client_borrower' 
  | 'investor_fund'
  | 'security_geofence'
  | 'audit_logs' 
  | 'supabase_sql'
  | 'auth_portal';

type ViewportMode = 'auto' | 'desktop' | 'tablet' | 'mobile';

function MainAppContent() {
  const isOnline = useOnlineStatus();
  const { user, profile, role, isAuthenticated, isAdmin, isSocio, logout } = useAuth();

  const [activeRole, setActiveRole] = useState<ActiveRole>('admin_cfo');
  const [viewportMode, setViewportMode] = useState<ViewportMode>('auto');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [authLoginType, setAuthLoginType] = useState<'collector' | 'admin'>('collector');

  const [routes, setRoutes] = useState<RouteData[]>(INITIAL_ROUTES);
  const [clients, setClients] = useState<ClientProfile[]>(INITIAL_CLIENTS);
  const [loans, setLoans] = useState<LoanDetail[]>(INITIAL_LOANS);
  const [expenses, setExpenses] = useState<RouteExpenseItem[]>(INITIAL_EXPENSES);
  const [ledger, setLedger] = useState<LedgerEntry[]>(INITIAL_LEDGER);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(INITIAL_AUDIT_LOGS);

  // Estado de conexión y latencia con Cloud SQL
  const [cloudSqlStatus, setCloudSqlStatus] = useState<'connected' | 'offline' | 'checking'>('checking');
  const [cloudSqlLatency, setCloudSqlLatency] = useState<number | null>(null);

  // Sincronización en tiempo real con Cloud SQL al montar o recuperar red
  useEffect(() => {
    let isMounted = true;

    const checkHealthAndSync = async () => {
      const startTime = performance.now();
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const latency = Math.round(performance.now() - startTime);
          if (isMounted) {
            setCloudSqlStatus('connected');
            setCloudSqlLatency(latency);
          }

          // Si hay conexión, sincronizar cola offline pendiente
          syncOfflineQueueWithServer().then(({ syncedCount }) => {
            if (syncedCount > 0 && isMounted) {
              console.log(`✅ Sincronizados ${syncedCount} pagos encolados en calle.`);
            }
          });
        } else {
          if (isMounted) setCloudSqlStatus('offline');
        }
      } catch {
        if (isMounted) setCloudSqlStatus('offline');
      }
    };

    checkHealthAndSync();
    const interval = setInterval(checkHealthAndSync, 20000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOnline]);

  // Registro de pago en calle o billetera (persistencia en tiempo real a Cloud SQL)
  const handleRegisterPayment = (
    loanId: string, 
    amount: number, 
    method: 'efectivo' | 'nequi' | 'daviplata', 
    notes: string
  ) => {
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;

    const preBalance = loan.remainingBalance;
    const postBalance = Math.max(0, preBalance - amount);
    const capitalRatio = loan.principal / loan.totalDebt;
    const principalPortion = amount * capitalRatio;
    const interestPortion = amount - principalPortion;

    const newEntry: LedgerEntry = {
      id: `led-${Date.now()}`,
      receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
      loanId: loan.id,
      clientId: loan.clientId,
      clientName: loan.clientName,
      routeId: loan.routeId,
      amount,
      principalPortion,
      interestPortion,
      paymentMethod: method,
      preBalance,
      postBalance,
      timestamp: new Date().toISOString(),
      gpsLocation: '6.2518 N, -75.6142 W (GPS Validado)',
      hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };

    // Actualización optimista inmediata en memoria (UI instantánea en calle)
    setLedger(prev => [newEntry, ...prev]);

    setLoans(prev => prev.map(l => {
      if (l.id === loanId) {
        return {
          ...l,
          remainingBalance: postBalance,
          totalCollected: l.totalCollected + amount,
          installmentsPaid: l.installmentsPaid + 1,
          todayPaid: true,
          status: postBalance === 0 ? 'liquidado' : l.status
        };
      }
      return l;
    }));

    setRoutes(prev => prev.map(r => {
      if (r.id === loan.routeId) {
        return {
          ...r,
          dailyGrossCollected: r.dailyGrossCollected + amount
        };
      }
      return r;
    }));

    // Enviar a la base de datos Cloud SQL en tiempo real vía backend
    if (isOnline) {
      fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry)
      })
        .then(res => {
          if (res.ok) {
            console.log('✅ Cobro guardado en Cloud SQL en tiempo real:', newEntry.receiptNumber);
          } else {
            console.warn('⚠️ Falló respuesta de Cloud SQL, guardando en cola offline.');
            enqueueOfflinePayment({
              loanId: loan.id,
              clientId: loan.clientId,
              clientName: loan.clientName,
              amount,
              paymentMethod: method,
              notes: notes || 'Cobro en calle encolado',
              timestamp: newEntry.timestamp,
              gpsLocation: newEntry.gpsLocation
            });
          }
        })
        .catch(err => {
          console.warn('⚠️ Error de red al comunicar con Cloud SQL, guardando offline:', err);
          enqueueOfflinePayment({
            loanId: loan.id,
            clientId: loan.clientId,
            clientName: loan.clientName,
            amount,
            paymentMethod: method,
            notes: notes || 'Cobro en calle encolado',
            timestamp: newEntry.timestamp,
            gpsLocation: newEntry.gpsLocation
          });
        });
    } else {
      // Dispositivo sin red en calle: encolar en localStorage
      enqueueOfflinePayment({
        loanId: loan.id,
        clientId: loan.clientId,
        clientName: loan.clientName,
        amount,
        paymentMethod: method,
        notes: notes || 'Cobro en calle offline',
        timestamp: newEntry.timestamp,
        gpsLocation: newEntry.gpsLocation
      });
    }
  };

  // Registro de gasto operativo
  const handleRegisterExpense = (
    category: RouteExpenseItem['category'], 
    amount: number, 
    description: string
  ) => {
    const currentRouteId = 'route-1';
    const newExpense: RouteExpenseItem = {
      id: `exp-${Date.now()}`,
      routeId: currentRouteId,
      category,
      amount,
      description,
      timestamp: new Date().toISOString(),
      isApproved: true
    };

    setExpenses(prev => [newExpense, ...prev]);

    setRoutes(prev => prev.map(r => {
      if (r.id === currentRouteId) {
        return {
          ...r,
          dailyExpenses: r.dailyExpenses + amount
        };
      }
      return r;
    }));

    const auditEvent: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: profile?.email || 'admin_cfo@rutacapital.co',
      role: profile?.role === 'admin' ? 'Administrador CFO' : 'Supervisor de Ruta',
      action: 'APROBACION_GASTO_OPEX',
      targetEntity: `route_expenses (${category})`,
      targetId: newExpense.id,
      oldValue: 'null',
      newValue: `category: ${category}, amount: $${amount.toLocaleString()} COP`,
      justification: description || 'Gasto operacional registrado en ruta de calle.',
      ipAddress: '190.157.24.81',
      immutableHash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };
    setAuditLogs(prev => [auditEvent, ...prev]);
  };

  const handleRestructureLoan = (loanId: string, newTerm?: number, newInstallment?: number) => {
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;

    const targetTerm = newTerm ?? (loan.termDays + 15);
    const targetInstallment = newInstallment ?? Math.round(loan.remainingBalance / targetTerm);

    setLoans(prev => prev.map(l => {
      if (l.id === loanId) {
        return {
          ...l,
          termDays: targetTerm,
          installmentAmount: targetInstallment,
          status: 'refinanciado'
        };
      }
      return l;
    }));

    const auditEvent: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: profile?.email || 'admin_cfo@rutacapital.co',
      role: 'Administrador CFO',
      action: 'REESTRUCTURACION_PLAZO',
      targetEntity: `loans (${loan.clientName})`,
      targetId: loan.id,
      oldValue: `term: ${loan.termDays}d, cuota: $${loan.installmentAmount.toLocaleString()}`,
      newValue: `term: ${targetTerm}d, cuota: $${targetInstallment.toLocaleString()}, status: refinanciado`,
      justification: `Reestructuración autorizada ante mora de ${loan.daysOverdue} días para recuperar capital en sector.`,
      ipAddress: '190.157.24.81',
      immutableHash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };
    setAuditLogs(prev => [auditEvent, ...prev]);
  };

  const handleToggleClientBlock = (clientId: string) => {
    let wasBlocked = false;
    let clientName = '';

    setClients(prev => prev.map(c => {
      if (c.id === clientId) {
        wasBlocked = c.hasPreventiveBlock;
        clientName = c.name;
        return { ...c, hasPreventiveBlock: !c.hasPreventiveBlock };
      }
      return c;
    }));

    const auditEvent: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: profile?.email || 'admin_cfo@rutacapital.co',
      role: 'Administrador CFO',
      action: wasBlocked ? 'DESBLOQUEO_CLIENTE' : 'BLOQUEO_PREVENTIVO',
      targetEntity: `clients (${clientName})`,
      targetId: clientId,
      oldValue: `hasPreventiveBlock: ${wasBlocked}`,
      newValue: `hasPreventiveBlock: ${!wasBlocked}`,
      justification: wasBlocked 
        ? 'Desbloqueo manual tras acuerdo verbal de pago con fiador solidario.'
        : 'Bloqueo preventivo manual activado por analista de riesgo.',
      ipAddress: '190.157.24.81',
      immutableHash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };
    setAuditLogs(prev => [auditEvent, ...prev]);
  };

  const handleReassignClientRoute = (clientId: string, newRouteId: string) => {
    const client = clients.find(c => c.id === clientId);
    const targetRoute = routes.find(r => r.id === newRouteId);
    if (!client || !targetRoute) return;

    const oldRoute = routes.find(r => r.id === client.routeId);

    setClients(prev => prev.map(c => c.id === clientId ? { ...c, routeId: newRouteId } : c));
    setLoans(prev => prev.map(l => l.clientId === clientId ? { ...l, routeId: newRouteId } : l));

    const auditEvent: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: profile?.email || 'admin_cfo@rutacapital.co',
      role: 'Administrador CFO',
      action: 'REASIGNACION_BARRIO',
      targetEntity: `clients (${client.tradeName})`,
      targetId: clientId,
      oldValue: `route: ${oldRoute?.name} (${oldRoute?.collectorName})`,
      newValue: `route: ${targetRoute.name} (${targetRoute.collectorName})`,
      justification: `Rebalanceo de carga territorial por densidad de micronegocios en ${client.neighborhood}.`,
      ipAddress: '190.157.24.81',
      immutableHash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };
    setAuditLogs(prev => [auditEvent, ...prev]);
  };

  const handleConfirmReconciliation = (
    routeId: string, 
    actualCash: number, 
    discrepancy: number, 
    notes: string
  ) => {
    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    const action = discrepancy < 0 
      ? 'AJUSTE_ARQUEO_FALTANTE' 
      : 'CIERRE_TURNO_AUDITADO';

    const auditEvent: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: profile?.email || 'boveda_auditor@rutacapital.co',
      role: 'Auditor Bóveda',
      action,
      targetEntity: `cash_drawer_sessions (${route.name})`,
      targetId: route.id,
      oldValue: `status: abierta, expected: $${(route.baseFloatingCapital + route.dailyGrossCollected - route.dailyExpenses).toLocaleString()} COP`,
      newValue: `status: ${discrepancy === 0 ? 'cuadre_exacto' : discrepancy < 0 ? 'faltante' : 'sobrante'}, actualCash: $${actualCash.toLocaleString()} COP, discrepancy: $${discrepancy.toLocaleString()} COP`,
      justification: notes || (discrepancy === 0 ? 'Cuadre perfecto de caja en sobre sellado.' : `Diferencia de $${discrepancy.toLocaleString()} COP registrada en sobre de entrega.`),
      ipAddress: '190.157.24.81 (Sede Central)',
      immutableHash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
      severity: discrepancy === 0 ? 'normal' : 'alerta_critica'
    };
    setAuditLogs(prev => [auditEvent, ...prev]);

    // Persistir arqueo de cierre en Cloud SQL
    fetch('/api/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `recon-${Date.now()}`,
        routeId: route.id,
        date: new Date().toISOString().split('T')[0],
        collectorId: 'col-01',
        collectorName: route.collectorName,
        expectedCash: (route.baseFloatingCapital + route.dailyGrossCollected - route.dailyExpenses),
        actualCashHanded: actualCash,
        discrepancy,
        status: discrepancy === 0 ? 'balanced' : discrepancy < 0 ? 'shortage' : 'surplus',
        notes: notes || '',
        verifiedByAdmin: false
      })
    })
      .then(res => {
        if (res.ok) console.log('✅ Arqueo de caja persistido exitosamente en Cloud SQL');
      })
      .catch(err => {
        console.warn('⚠️ No se pudo enviar arqueo a Cloud SQL de inmediato:', err);
      });
  };

  // Clases dinámicas de ancho según el modo de simulación o responsive natural
  const getContainerMaxWidth = () => {
    switch (viewportMode) {
      case 'mobile':
        return 'max-w-md mx-auto shadow-2xl border-x border-slate-800 bg-slate-950 min-h-screen';
      case 'tablet':
        return 'max-w-3xl mx-auto shadow-2xl border-x border-slate-800 bg-slate-950 min-h-screen';
      case 'desktop':
      case 'auto':
      default:
        return 'w-full max-w-7xl mx-auto';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* BARRA SUPERIOR DE SELECTOR DE DISPOSITIVOS RESPONSIVE (COMPUTADORA / TABLETA / MÓVIL) */}
      <div className="bg-slate-950 border-b border-slate-900 py-1.5 px-4 text-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <span className="hidden sm:inline">Modo Adaptativo Multi-Dispositivo:</span>
            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => setViewportMode('auto')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  viewportMode === 'auto' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Ajuste fluido automático según el tamaño de la ventana"
              >
                Fluido (Auto)
              </button>
              <button
                onClick={() => setViewportMode('desktop')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  viewportMode === 'desktop' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Vista de Computadora de Escritorio / Monitor"
              >
                <Monitor className="w-3 h-3" />
                <span className="hidden md:inline">Computadora</span>
              </button>
              <button
                onClick={() => setViewportMode('tablet')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  viewportMode === 'tablet' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Vista de Tableta (iPad / Galaxy Tab)"
              >
                <Tablet className="w-3 h-3" />
                <span>Tableta</span>
              </button>
              <button
                onClick={() => setViewportMode('mobile')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  viewportMode === 'mobile' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Vista de Celular Móvil (iPhone / Android)"
              >
                <Smartphone className="w-3 h-3" />
                <span>Móvil</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* ESTADO DE AUTENTICACIÓN RBAC EN BARRA SUPERIOR */}
            {isAuthenticated ? (
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-xl text-[11px]">
                <div className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-emerald-400' : isSocio ? 'bg-blue-400' : 'bg-amber-400'}`} />
                <span className="text-slate-300 font-semibold truncate max-w-[120px] sm:max-w-[180px]">
                  {profile?.fullName.split(' ')[0]}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase font-mono bg-slate-800 text-slate-400">
                  {role}
                </span>
                <button
                  onClick={logout}
                  className="text-slate-400 hover:text-rose-400 transition-colors ml-1 p-0.5"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setActiveRole('auth_portal')}
                className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-xl hover:bg-emerald-500/20 transition-all"
              >
                <LogIn className="w-3 h-3" />
                <span className="hidden sm:inline">Ingresar como Admin/Socio</span>
              </button>
            )}

            <PWAInstallButton />
          </div>
        </div>
      </div>

      {/* AVISO OFFLINE FLOTANTE */}
      {!isOnline && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          <span>Modo Desconectado Activado: Cobros guardados localmente para sincronización posterior.</span>
        </div>
      )}

      {/* HEADER PRINCIPAL RESPONSIVE */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
        <div className={`${getContainerMaxWidth()} px-4 sm:px-6 h-16 flex items-center justify-between`}>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-900/30 shrink-0">
              <DollarSign className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-sm tracking-tight text-white uppercase truncate">
                  RutaCapital OS
                </h1>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold border flex items-center gap-1 ${
                  cloudSqlStatus === 'connected'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cloudSqlStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {cloudSqlStatus === 'connected' ? `CLOUD SQL (${cloudSqlLatency ?? 3}ms)` : 'OFFLINE'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                Microcrédito, Liquidez & Acceso Restringido a Socios
              </p>
            </div>
          </div>

          {/* NAVEGACIÓN DESKTOP / TABLETA */}
          <nav className="hidden md:flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs overflow-x-auto max-w-[660px]">
            <button
              onClick={() => setActiveRole('admin_cfo')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                activeRole === 'admin_cfo'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building className="w-3.5 h-3.5" />
              <span>CFO Admin</span>
              <Lock className="w-2.5 h-2.5 text-emerald-400/80 ml-0.5" />
            </button>

            <button
              onClick={() => setActiveRole('investor_fund')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                activeRole === 'investor_fund'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Fondo Socios</span>
              <Lock className="w-2.5 h-2.5 text-blue-400/80 ml-0.5" />
            </button>

            <button
              onClick={() => setActiveRole('collector_street')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                activeRole === 'collector_street'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              <span>Rutero</span>
            </button>

            <button
              onClick={() => setActiveRole('client_borrower')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                activeRole === 'client_borrower'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Deudor & QR</span>
            </button>

            <button
              onClick={() => setActiveRole('security_geofence')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                activeRole === 'security_geofence'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radar className="w-3.5 h-3.5" />
              <span>Seguridad</span>
            </button>

            <button
              onClick={() => setActiveRole('audit_logs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                activeRole === 'audit_logs'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Auditoría</span>
            </button>

            <button
              onClick={() => setActiveRole('supabase_sql')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                activeRole === 'supabase_sql'
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>SQL & RLS</span>
            </button>

            <button
              onClick={() => setActiveRole('auth_portal')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                activeRole === 'auth_portal'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-900/40'
                  : 'text-amber-400 hover:text-amber-300'
              }`}
              title="Portal de Login y Control de Roles"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Login RBAC</span>
            </button>
          </nav>

          {/* BOTÓN HAMBURGUESA PARA PANTALLAS PEQUEÑAS / MÓVILES */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700"
              aria-label="Abrir menú"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* MENÚ DESPLEGABLE MÓVIL */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-900/98 px-4 py-3 space-y-1 shadow-2xl animate-in slide-in-from-top-2 duration-200">
            {[
              { id: 'admin_cfo', name: '1. Panel Administrador (CFO) [Protegido]', icon: Building },
              { id: 'investor_fund', name: '2. Fondo de Socios & Dividendos [Protegido]', icon: Users },
              { id: 'collector_street', name: '3. Interfaz Cobrador (Calle)', icon: Bike },
              { id: 'client_borrower', name: '4. Portal Deudor (Saldo & QR)', icon: UserCheck },
              { id: 'security_geofence', name: '5. Ciberseguridad & Geocercas', icon: Radar },
              { id: 'audit_logs', name: '6. Auditoría Inmutable (Logs SHA-256)', icon: ShieldAlert },
              { id: 'supabase_sql', name: '7. Script Supabase (SQL DDL & RLS)', icon: Database },
              { id: 'auth_portal', name: '8. Autenticación & Cambio de Rol (RBAC)', icon: KeyRound },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveRole(item.id as ActiveRole);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    activeRole === item.id
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 text-emerald-400" />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* CONTENIDO PRINCIPAL ADAPTABLE (RESPONSIVE VIEWPORT) */}
      <main className={`flex-1 ${getContainerMaxWidth()} px-3 sm:px-6 lg:px-8 py-5 sm:py-6 md:py-8`}>
        {/* VISTA 1: COCKPIT CFO & LIQUIDEZ (PROTEGIDO POR RBAC PARA ADMIN Y SOCIO) */}
        {activeRole === 'admin_cfo' && (
          <AdminRouteGuard 
            requiredRole="admin_or_socio" 
            onRedirectToAuthorized={(roleRedirect) => setActiveRole(roleRedirect as ActiveRole)}
          >
            <AdminInvestorDashboard
              routes={routes}
              clients={clients}
              loans={loans}
              expenses={expenses}
              ledger={ledger}
              onRestructureLoan={handleRestructureLoan}
              onToggleClientBlock={handleToggleClientBlock}
              onReassignClientRoute={handleReassignClientRoute}
              onConfirmReconciliation={handleConfirmReconciliation}
              onNavigateToTab={(tab) => setActiveRole(tab as ActiveRole)}
            />
          </AdminRouteGuard>
        )}

        {/* VISTA 2: FONDO DE INVERSIONISTAS & DIVIDENDOS (PROTEGIDO POR RBAC) */}
        {activeRole === 'investor_fund' && (
          <AdminRouteGuard 
            requiredRole="admin_or_socio" 
            onRedirectToAuthorized={(roleRedirect) => setActiveRole(roleRedirect as ActiveRole)}
          >
            <InvestorFundView />
          </AdminRouteGuard>
        )}

        {/* VISTA 3: TERMINAL DEL COBRADOR EN CALLE (PROTEGIDA POR ROL COBRADOR Y RLS DE RUTA) */}
        {activeRole === 'collector_street' && (
          <CollectorRouteGuard routes={routes}>
            {({ activeRouteId }) => {
              const assignedRoute = routes.find(r => r.id === activeRouteId) || routes[0];
              // Aislamiento de datos RLS: Solo clientes, préstamos y gastos de la ruta del rutero
              const routeClients = clients.filter(c => c.routeId === activeRouteId);
              const routeLoans = loans.filter(l => l.routeId === activeRouteId);
              const routeExpenses = expenses.filter(e => e.routeId === activeRouteId);
              const routeLedger = ledger.filter(led => led.routeId === activeRouteId);

              return (
                <CollectorStreetView
                  currentRoute={assignedRoute}
                  clients={routeClients}
                  loans={routeLoans}
                  expenses={routeExpenses}
                  ledger={routeLedger}
                  onRegisterPayment={handleRegisterPayment}
                  onRegisterExpense={handleRegisterExpense}
                  onConfirmReconciliation={handleConfirmReconciliation}
                />
              );
            }}
          </CollectorRouteGuard>
        )}

        {/* VISTA 4: PORTAL DEL DEUDOR (CLIENTE) */}
        {activeRole === 'client_borrower' && (
          <ClientBorrowerView
            clients={clients}
            loans={loans}
            onDigitalPay={(loanId, amount, method) => handleRegisterPayment(loanId, amount, method, 'Pago digital QR / Nequi')}
            ledger={ledger}
          />
        )}

        {/* VISTA 5: GEOCERCAS & CIBERSEGURIDAD (PROTEGIDO POR RBAC) */}
        {activeRole === 'security_geofence' && (
          <AdminRouteGuard 
            requiredRole="admin_or_socio" 
            onRedirectToAuthorized={(roleRedirect) => setActiveRole(roleRedirect as ActiveRole)}
          >
            <CollusionGeofenceMonitor
              routes={routes}
              clients={clients}
              loans={loans}
              ledger={ledger}
            />
          </AdminRouteGuard>
        )}

        {/* VISTA 6: AUDITORÍA INMUTABLE SHA-256 (PROTEGIDO POR RBAC) */}
        {activeRole === 'audit_logs' && (
          <AdminRouteGuard 
            requiredRole="admin_or_socio" 
            onRedirectToAuthorized={(roleRedirect) => setActiveRole(roleRedirect as ActiveRole)}
          >
            <AuditLogView logs={auditLogs} />
          </AdminRouteGuard>
        )}

        {/* VISTA 7: ESQUEMA Y POLÍTICAS RLS SUPABASE */}
        {activeRole === 'supabase_sql' && (
          <SupabaseSqlViewer />
        )}

        {/* VISTA 8: PORTAL DE LOGIN RBAC & CAMBIO DE ROL */}
        {activeRole === 'auth_portal' && (
          <div className="space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Supabase Auth & RBAC Studio
              </span>
              <h2 className="text-2xl font-black text-white">
                Gestión de Autenticación & Roles
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Prueba el inicio de sesión exclusivo para Cobradores en calle (con aislamiento de ruta y opción "Recordar sesión") o el acceso restringido a la Alta Dirección (CFO & Socios).
              </p>
            </div>

            <div className="flex justify-center gap-2">
              <button
                onClick={() => setAuthLoginType('collector')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  authLoginType === 'collector'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Bike className="w-4 h-4" />
                Login Cobrador (Terminal de Calle)
              </button>
              <button
                onClick={() => setAuthLoginType('admin')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  authLoginType === 'admin'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Building className="w-4 h-4" />
                Login Administrador / Socios
              </button>
            </div>

            {authLoginType === 'collector' ? (
              <CollectorLoginView onSuccess={() => setActiveRole('collector_street')} />
            ) : (
              <AdminLoginView onSuccess={() => setActiveRole('admin_cfo')} />
            )}
          </div>
        )}
      </main>

      {/* BARRA INFERIOR STICKY PARA MÓVIL (QUICK BOTTOM NAVIGATION) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex justify-around p-1.5">
        <button
          onClick={() => setActiveRole('admin_cfo')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-xl text-[10px] font-semibold transition-all ${
            activeRole === 'admin_cfo' ? 'text-emerald-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Building className="w-5 h-5 mb-0.5" />
          <span>CFO</span>
        </button>

        <button
          onClick={() => setActiveRole('investor_fund')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-xl text-[10px] font-semibold transition-all ${
            activeRole === 'investor_fund' ? 'text-blue-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span>Socios</span>
        </button>

        <button
          onClick={() => setActiveRole('collector_street')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-xl text-[10px] font-semibold transition-all ${
            activeRole === 'collector_street' ? 'text-emerald-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Bike className="w-5 h-5 mb-0.5" />
          <span>Rutero</span>
        </button>

        <button
          onClick={() => setActiveRole('client_borrower')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-xl text-[10px] font-semibold transition-all ${
            activeRole === 'client_borrower' ? 'text-emerald-400 font-bold' : 'text-slate-400'
          }`}
        >
          <UserCheck className="w-5 h-5 mb-0.5" />
          <span>Deudor</span>
        </button>

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center p-1.5 rounded-xl text-[10px] font-semibold text-slate-400 hover:text-white"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>Más</span>
        </button>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 mb-14 sm:mb-0">
        <div className={`${getContainerMaxWidth()} px-4 flex flex-col sm:flex-row items-center justify-between gap-2`}>
          <span>RutaCapital OS • RBAC & Supabase Auth Enforced</span>
          <span className="font-mono text-[11px] text-slate-400">
            Rol Activo: {role ? role.toUpperCase() : 'NO AUTENTICADO'} • Viewport: {viewportMode.toUpperCase()}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
