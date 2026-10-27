import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Bike, 
  Database, 
  ShieldAlert, 
  DollarSign, 
  Users, 
  LogOut,
  ShieldCheck,
  Crown
} from 'lucide-react';
import { 
  INITIAL_ROUTES, 
  INITIAL_CLIENTS, 
  INITIAL_LOANS, 
  INITIAL_EXPENSES, 
  INITIAL_LEDGER,
  INITIAL_COLLECTOR_BASES,
  RouteData,
  ClientProfile,
  LoanDetail,
  RouteExpenseItem,
  LedgerEntry,
  CollectorBase
} from './data/mockData';
import { INITIAL_AUDIT_LOGS, AuditLogItem } from './data/auditLogData';
import { AdminInvestorDashboard } from './components/AdminInvestorDashboard';
import { SuperAdminDashboardView } from './components/SuperAdminDashboardView';
import { SuperAdminLayout } from './components/SuperAdminLayout';
import { CollectorStreetView } from './components/CollectorStreetView';
import { CollectorLayout } from './components/CollectorLayout';
import { ClientBorrowerView } from './components/ClientBorrowerView';
import { AdminLoginView } from './components/AdminLoginView';
import { CollectorLoginView } from './components/CollectorLoginView';
import { NewClientLoanModal } from './components/NewClientLoanModal';
import { SplashScreen } from './components/SplashScreen';
import { EnRutaLogo } from './components/EnRutaLogo';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useOnlineStatus, enqueueOfflinePayment } from './utils/offlineSync';
import { fetchClientsAndLoansFromDB } from './services/clientSyncService';
import { supabase, isLiveSupabaseConfigured } from './services/supabaseAuth';
import { roundCOP } from './utils/financialCalculations';
import { sendAutomaticWhatsAppReceipt } from './utils/whatsappMessaging';
import { Par30AlertBanner, Par30AlertItem } from './components/Par30AlertBanner';

function MainAppContent() {
  const isOnline = useOnlineStatus();
  const { session, user, profile, role, isAuthenticated, logout, loading: authLoading, isLoggingOut } = useAuth();

  const [routes, setRoutes] = useState<RouteData[]>(INITIAL_ROUTES);
  const [clients, setClients] = useState<ClientProfile[]>(INITIAL_CLIENTS);
  const [loans, setLoans] = useState<LoanDetail[]>(INITIAL_LOANS);
  const [expenses, setExpenses] = useState<RouteExpenseItem[]>(INITIAL_EXPENSES);
  const [ledger, setLedger] = useState<LedgerEntry[]>(INITIAL_LEDGER);
  const [collectorBases, setCollectorBases] = useState<CollectorBase[]>(INITIAL_COLLECTOR_BASES);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(INITIAL_AUDIT_LOGS);
  const [showNewClientModal, setShowNewClientModal] = useState<boolean>(false);
  const [authLoginType, setAuthLoginType] = useState<'collector' | 'admin'>('admin');

  // Estado global de alertas PAR 30
  const [activeAlerts, setActiveAlerts] = useState<Par30AlertItem[]>([]);
  const [legalDispatches, setLegalDispatches] = useState<Record<string, boolean>>({});

  // Aislamiento Multi-Tenant estricto por organization_id (tenant_id)
  const isSuperAdminRole = role === 'super_admin' || session?.user?.email === 'estebanochoamesa@gmail.com';
  const currentTenantId = profile?.organizationId || 'org-medellin-01';

  const rawTenantRoutes = isSuperAdminRole
    ? routes
    : routes.filter((r) => (r.organizationId || 'org-medellin-01') === currentTenantId);

  const defaultOrgRoute: RouteData = {
    id: `route-${currentTenantId.replace(/^org-?/i, '').slice(0, 12)}`,
    code: `RUTA-${currentTenantId.replace(/^org-?/i, '').toUpperCase().slice(0, 6)}`,
    name: `Ruta Principal · ${profile?.organizationName || 'Fondo'}`,
    zone: 'Centro / El Hueco',
    organizationId: currentTenantId,
    collectorName: 'Cobrador de Zona',
    collectorPhone: profile?.phone || '3000000000',
    baseFloatingCapital: 0,
    fixedDailyOpex: 45000,
    collectorCommissionRate: 10,
    targetRecoveryRate: 92,
    activeLoansCount: 0,
    totalPortfolio: 0,
    dailyGrossExpected: 0,
    dailyGrossCollected: 0,
    dailyExpenses: 0,
    par1Rate: 0,
    par7Rate: 0,
    par30Rate: 0,
    status: 'activa',
  };

  const tenantRoutes =
    !isSuperAdminRole && rawTenantRoutes.length === 0 ? [defaultOrgRoute] : rawTenantRoutes;
  const tenantRouteIds = new Set(tenantRoutes.map((r) => r.id));

  const tenantClients = isSuperAdminRole
    ? []
    : clients.filter(
        (c) =>
          (c.organizationId || (c.routeId === 'route-2' ? 'org-norte-02' : 'org-medellin-01')) ===
            currentTenantId || tenantRouteIds.has(c.routeId)
      );

  const tenantLoans = isSuperAdminRole
    ? []
    : loans.filter(
        (l) =>
          (l.organizationId || (l.routeId === 'route-2' ? 'org-norte-02' : 'org-medellin-01')) ===
            currentTenantId || tenantRouteIds.has(l.routeId)
      );

  const tenantExpenses = isSuperAdminRole
    ? []
    : expenses.filter(
        (e) => (e.organizationId || 'org-medellin-01') === currentTenantId || tenantRouteIds.has(e.routeId)
      );

  const tenantLedger = isSuperAdminRole
    ? []
    : ledger.filter(
        (led) =>
          (led.organizationId || 'org-medellin-01') === currentTenantId || tenantRouteIds.has(led.routeId)
      );

  const tenantCollectorBases = isSuperAdminRole
    ? []
    : collectorBases.filter(
        (b) => (b.organizationId || 'org-medellin-01') === currentTenantId || tenantRouteIds.has(b.routeId)
      );

  useEffect(() => {
    if (isSuperAdminRole) {
      setActiveAlerts([]);
      return;
    }

    const par30Loans = tenantLoans.filter(
      (loan) => loan.daysOverdue >= 30 && loan.status !== 'liquidado' && loan.status !== 'liquidated'
    );

    const generatedAlerts: Par30AlertItem[] = par30Loans.map((loan) => {
      const matchedClient = tenantClients.find((c) => c.id === loan.clientId);
      return {
        id: `par30-alert-${loan.id}`,
        loanId: loan.id,
        loanCode: loan.code,
        clientId: loan.clientId,
        clientName: loan.clientName,
        tradeName: loan.tradeName,
        phone: matchedClient?.phone,
        guarantorName: matchedClient?.guarantorName,
        guarantorPhone: matchedClient?.guarantorPhone,
        routeId: loan.routeId,
        daysOverdue: loan.daysOverdue,
        remainingBalance: roundCOP(loan.remainingBalance),
        installmentAmount: roundCOP(loan.installmentAmount),
        termDays: loan.termDays,
        status: loan.status,
        legalDispatched: Boolean(legalDispatches[loan.id]),
      };
    });

    setActiveAlerts(generatedAlerts);
  }, [loans, clients, legalDispatches, isSuperAdminRole, currentTenantId]);

  const syncDatabaseClients = async () => {
    let dbRoutesList: any[] = [];
    try {
      const rRes = await fetch('/api/routes');
      if (rRes.ok) {
        const rJson = await rRes.json();
        if (Array.isArray(rJson)) {
          dbRoutesList = rJson;
        }
      }
    } catch (rErr) {
      console.warn('Aviso consultando /api/routes:', rErr);
    }

    const { data, error } = await fetchClientsAndLoansFromDB();
    if (error) {
      console.error('❌ [Error al sincronizar listado de clientes]:', error);
      return;
    }
    if (data) {
      setClients(data.clients);
      setLoans(prevLoans => {
        const prevPaidMap = new Map(prevLoans.map(pl => [pl.id, pl.todayPaid]));
        return data.loans.map(dl => {
          const wasPaidLocally = prevPaidMap.get(dl.id);
          return {
            ...dl,
            todayPaid: Boolean(dl.todayPaid) || Boolean(wasPaidLocally)
          };
        });
      });
      setRoutes(prevRoutes => {
        const routeMap = new Map<string, RouteData>();
        prevRoutes.forEach(r => routeMap.set(r.id, r));

        dbRoutesList.forEach((dbr: any) => {
          const rid = String(dbr.id);
          const existing = routeMap.get(rid);
          routeMap.set(rid, {
            id: rid,
            code: existing?.code || rid.toUpperCase().slice(0, 12),
            name: dbr.name || existing?.name || `Ruta ${rid}`,
            zone: dbr.zone || existing?.zone || 'Zona Operativa',
            organizationId: dbr.organizationId || dbr.organization_id || existing?.organizationId || 'org-medellin-01',
            collectorName: dbr.collectorName || dbr.collector_name || existing?.collectorName || 'Cobrador Asignado',
            collectorPhone: existing?.collectorPhone || '3000000000',
            baseFloatingCapital: existing?.baseFloatingCapital ?? 0,
            fixedDailyOpex: Number(dbr.operatingExpenseBudget || existing?.fixedDailyOpex || 35000),
            collectorCommissionRate: existing?.collectorCommissionRate ?? 10,
            targetRecoveryRate: existing?.targetRecoveryRate ?? 92,
            activeLoansCount: 0,
            totalPortfolio: 0,
            dailyGrossExpected: 0,
            dailyGrossCollected: existing?.dailyGrossCollected ?? 0,
            dailyExpenses: existing?.dailyExpenses ?? 0,
            par1Rate: existing?.par1Rate ?? 0,
            par7Rate: existing?.par7Rate ?? 0,
            par30Rate: existing?.par30Rate ?? 0,
            status: 'activa',
          });
        });

        data.clients.forEach(c => {
          if (c.routeId && !routeMap.has(c.routeId)) {
            routeMap.set(c.routeId, {
              id: c.routeId,
              code: c.routeId.toUpperCase().slice(0, 12),
              name: `Ruta ${c.routeId}`,
              zone: c.neighborhood || 'Zona Operativa',
              organizationId: c.organizationId || 'org-medellin-01',
              collectorName: 'Cobrador Asignado',
              collectorPhone: '3000000000',
              baseFloatingCapital: 0,
              fixedDailyOpex: 35000,
              collectorCommissionRate: 10,
              targetRecoveryRate: 92,
              activeLoansCount: 0,
              totalPortfolio: 0,
              dailyGrossExpected: 0,
              dailyGrossCollected: 0,
              dailyExpenses: 0,
              par1Rate: 0,
              par7Rate: 0,
              par30Rate: 0,
              status: 'activa',
            });
          }
        });

        const allRoutes = Array.from(routeMap.values());
        return allRoutes.map(r => {
          const rLoans = data.loans.filter(l => l.routeId === r.id && l.status !== 'liquidado' && l.status !== 'liquidated');
          return {
            ...r,
            activeLoansCount: rLoans.length,
            totalPortfolio: rLoans.reduce((sum, l) => sum + l.remainingBalance, 0),
            dailyGrossExpected: rLoans.reduce((sum, l) => sum + l.installmentAmount, 0),
          };
        });
      });
    }
  };

  useEffect(() => {
    let isMounted = true;
    const checkHealthAndSync = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok && isMounted) {
          await syncDatabaseClients();
        }
      } catch (err) {
        console.warn('Sync health check warning:', err);
      }
    };
    checkHealthAndSync();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRegisterPayment = (loanId: string, amount: number, method: 'efectivo' | 'nequi' | 'bancolombia' | 'daviplata', notes?: string) => {
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;

    const safeAmount = roundCOP(amount);
    const preBalance = loan.remainingBalance;
    const rawPostBalance = preBalance - safeAmount;

    // 1. Condición Matemática Segura: balance <= 0 fuerza el saldo a 0 y estado 'liquidado'/'liquidated'
    const postBalance = rawPostBalance <= 0 ? 0 : roundCOP(rawPostBalance);
    const isLiquidated = postBalance <= 0;

    const interestPortion = roundCOP(safeAmount * 0.20);
    const principalPortion = Math.max(0, roundCOP(safeAmount - interestPortion));

    const newEntry: LedgerEntry = {
      id: `led-${Date.now()}`,
      receiptNumber: `REC-${Math.floor(100000 + Math.random() * 900000)}`,
      loanId: loan.id,
      clientId: loan.clientId,
      clientName: loan.clientName,
      routeId: loan.routeId,
      amount: safeAmount,
      principalPortion,
      interestPortion,
      paymentMethod: method,
      preBalance,
      postBalance,
      timestamp: new Date().toISOString(),
      gpsLocation: notes && notes.includes('GPS:') ? notes.split('GPS:')[1].trim() : '6.2442, -75.5812 (Estimado)',
      hash: `sha256-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    };

    setLedger(prev => [newEntry, ...prev]);

    // 3. Filtro Frontal y Recarga Inmediata: Actualización inmediata en estado local React
    setLoans(prev => prev.map(l => {
      if (l.id === loanId) {
        const rem = roundCOP(l.remainingBalance - safeAmount);
        const liquidated = rem <= 0;
        return {
          ...l,
          remainingBalance: liquidated ? 0 : rem,
          totalCollected: roundCOP(l.totalCollected + safeAmount),
          installmentsPaid: l.installmentsPaid + 1,
          todayPaid: true,
          status: liquidated ? 'liquidated' : l.status,
          liquidationDate: liquidated ? new Date().toISOString().split('T')[0] : l.liquidationDate,
        };
      }
      return l;
    }));

    setRoutes(prev => prev.map(r => {
      if (r.id === loan.routeId) {
        return {
          ...r,
          dailyGrossCollected: roundCOP(r.dailyGrossCollected + safeAmount)
        };
      }
      return r;
    }));

    // 2. Actualización Doble en Supabase (Cadena: INSERT diario_ledger -> UPDATE loans)
    if (isOnline) {
      if (isLiveSupabaseConfigured) {
        supabase.from('daily_ledger').insert([{
          id: newEntry.id,
          receipt_number: newEntry.receiptNumber,
          loan_id: newEntry.loanId,
          client_id: newEntry.clientId,
          client_name: newEntry.clientName,
          route_id: newEntry.routeId,
          amount: safeAmount,
          principal_portion: principalPortion,
          interest_portion: interestPortion,
          payment_method: method,
          pre_balance: preBalance,
          post_balance: postBalance,
          timestamp: newEntry.timestamp,
          gps_location: newEntry.gpsLocation,
          hash: newEntry.hash,
        }]).then(({ error: insertErr }) => {
          if (insertErr) {
            console.warn('⚠️ [Supabase daily_ledger insert]:', insertErr);
          }

          // Operaciones en cadena: Inmediatamente UPDATE a la tabla loans cambiando status a liquidated
          supabase.from('loans').update({
            remaining_balance: postBalance,
            last_payment_date: newEntry.timestamp,
            paid_days: loan.installmentsPaid + 1,
            status: isLiquidated ? 'liquidated' : 'active',
          }).eq('id', loanId).then(({ error: updateErr }) => {
            if (updateErr) console.warn('⚠️ [Supabase loans update]:', updateErr);
            
            // Si el crédito se liquidó, guardar en historial inmutable
            if (isLiquidated) {
              supabase.from('liquidated_loans_history').insert([{
                id: `liq-${loanId}`,
                loan_id: loanId,
                client_id: loan.clientId,
                client_name: loan.clientName,
                organization_id: loan.organizationId || 'org-medellin-01',
                final_principal_amount: loan.principal,
                total_paid: loan.totalDebt - loan.remainingBalance + safeAmount,
                liquidation_date: new Date().toISOString(),
                loan_snapshot: loan
              }]).then(({ error: liqErr }) => {
                if (liqErr) console.warn('⚠️ [Supabase liquidated_loans_history insert]:', liqErr);
              });
            }
          });
        });
      }
    } else {
      enqueueOfflinePayment({
        loanId: loan.id,
        clientId: loan.clientId,
        clientName: loan.clientName,
        routeId: loan.routeId,
        organizationId: loan.organizationId || currentTenantId,
        amount: safeAmount,
        paymentMethod: method === 'bancolombia' ? 'nequi' : method,
        notes: notes || 'Cobro offline',
        timestamp: newEntry.timestamp,
        gpsLocation: newEntry.gpsLocation,
        clientTxUuid: `tx-${newEntry.id}`,
      });
    }

    const matchedClient = clients.find((c) => c.id === loan.clientId);
    if (matchedClient?.phone) {
      sendAutomaticWhatsAppReceipt({
        phone: matchedClient.phone,
        amount: safeAmount,
        remainingBalance: postBalance,
        clientName: matchedClient.name,
        receiptNumber: newEntry.receiptNumber,
      }).catch((err) => console.warn('Automatic WhatsApp receipt dispatch warning:', err));
    }
  };

  const handleRegisterExpense = (category: RouteExpenseItem['category'], amount: number, description: string) => {
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
    setRoutes(prev => prev.map(r => r.id === currentRouteId ? { ...r, dailyExpenses: r.dailyExpenses + amount } : r));
  };

  const handleRestructureLoan = (loanId: string) => {
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;
    const targetTerm = loan.termDays + 15;
    const targetInstallment = roundCOP(loan.remainingBalance / targetTerm);

    setLoans(prev => prev.map(l => l.id === loanId ? { ...l, termDays: targetTerm, installmentAmount: targetInstallment, daysOverdue: 0, status: 'refinanciado' } : l));
    setClients(prev => prev.map(c => c.id === loan.clientId ? { ...c, daysOverdue: 0, hasPreventiveBlock: false, riskTier: 'B_promedio' } : c));
  };

  const handleToggleClientBlock = (clientId: string) => {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, hasPreventiveBlock: !c.hasPreventiveBlock } : c));
  };

  const handleReassignClientRoute = (clientId: string, newRouteId: string) => {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, routeId: newRouteId } : c));
    setLoans(prev => prev.map(l => l.clientId === clientId ? { ...l, routeId: newRouteId } : l));
  };

  const handleConfirmReconciliation = (routeId: string, actualCash: number, discrepancy: number, notes: string) => {
    console.log('Arqueo confirmado:', { routeId, actualCash, discrepancy, notes });
  };

  const handleClientCreated = (newClient: ClientProfile, newLoan: LoanDetail) => {
    setClients(prev => [newClient, ...prev.filter(c => c.id !== newClient.id)]);
    setLoans(prev => [newLoan, ...prev.filter(l => l.id !== newLoan.id)]);
    setRoutes(prev => {
      if (prev.some(r => r.id === newClient.routeId)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: newClient.routeId,
          code: newClient.routeId.toUpperCase().slice(0, 12),
          name: `Ruta ${newClient.neighborhood || newClient.routeId}`,
          zone: newClient.neighborhood || 'Medellín',
          organizationId: newClient.organizationId || currentTenantId,
          collectorName: profile?.fullName || 'Cobrador de Zona',
          collectorPhone: profile?.phone || '3000000000',
          baseFloatingCapital: 0,
          fixedDailyOpex: 35000,
          collectorCommissionRate: 10,
          targetRecoveryRate: 92,
          activeLoansCount: 1,
          totalPortfolio: newLoan.remainingBalance,
          dailyGrossExpected: newLoan.installmentAmount,
          dailyGrossCollected: 0,
          dailyExpenses: 0,
          par1Rate: 0,
          par7Rate: 0,
          par30Rate: 0,
          status: 'activa',
        },
      ];
    });
    setShowNewClientModal(false);
  };

  const handleLoanCreatedForExistingClient = (newLoan: LoanDetail) => {
    setLoans(prev => [newLoan, ...prev.filter(l => l.id !== newLoan.id)]);
    setShowNewClientModal(false);
  };

  const handleAssignCollectorBase = (newBase: CollectorBase) => {
    setCollectorBases(prev => [newBase, ...prev]);
  };

  const handleUpdateCollectorBaseStatus = (baseId: string, status: 'ACTIVA' | 'DEVUELTA') => {
    setCollectorBases(prev => prev.map(b => b.id === baseId ? { ...b, status } : b));
  };

  const handleCollectorOpenNewClientModal = React.useCallback(() => {
    setShowNewClientModal(true);
  }, []);

  if (authLoading || isLoggingOut) {
    return <SplashScreen />;
  }

  if (!isAuthenticated || !profile) {
    return (
      <div className="min-h-screen bg-[#0d1b2a] text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center justify-center mb-2">
            <EnRutaLogo size="md" showSubtitle={true} className="justify-center" />
          </div>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setAuthLoginType('admin')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                authLoginType === 'admin'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Administrador / Socios
            </button>
            <button
              onClick={() => setAuthLoginType('collector')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                authLoginType === 'collector'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cobrador (Calle)
            </button>
          </div>

          {authLoginType === 'admin' ? (
            <AdminLoginView />
          ) : (
            <CollectorLoginView />
          )}
        </div>
      </div>
    );
  }

  // Inyección de consola de depuración solicitada (Paso 2)
  console.log("DEBUG ROL ACTIVO: ", profile?.role, " CORREO: ", session?.user?.email);

  const AdminLayout = () => (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm font-bold">
            RC
          </div>
          <div>
            <h2 className="text-white font-bold text-sm tracking-tight">{profile.fullName}</h2>
            <p className="text-[11px] text-slate-400 font-mono">
              Rol: <span className="text-emerald-400 font-semibold">{role?.toUpperCase()}</span> · {profile.organizationName || 'RutaCapital'}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/60 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
          title="Cerrar sesión de forma segura"
        >
          <LogOut className="w-4 h-4" />
          <span>Cerrar Sesión</span>
        </button>
      </header>

      {!isSuperAdminRole && activeAlerts.length > 0 && (
        <Par30AlertBanner
          activeAlerts={activeAlerts}
          onRestructureLoan={handleRestructureLoan}
          onInitiateLegalCollection={(alert) => setLegalDispatches(prev => ({ ...prev, [alert.loanId]: true }))}
          onSimulatePar30Case={() => {}}
        />
      )}

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
        <AdminInvestorDashboard
          routes={tenantRoutes}
          clients={tenantClients}
          loans={tenantLoans}
          expenses={tenantExpenses}
          ledger={tenantLedger}
          collectorBases={tenantCollectorBases}
          onAssignCollectorBase={handleAssignCollectorBase}
          onUpdateCollectorBaseStatus={handleUpdateCollectorBaseStatus}
          onCollectorCreated={(collector) => {
            setRoutes(prev => {
              const exists = prev.some(r => r.id === collector.assignedRouteId);
              if (exists) {
                return prev.map(r =>
                  r.id === collector.assignedRouteId
                    ? {
                        ...r,
                        organizationId: currentTenantId,
                        collectorName: collector.name,
                        zone: collector.routeZone || r.zone,
                        name: collector.routeZone || r.name,
                      }
                    : r
                );
              }
              const newRouteNumber = String(prev.length + 1).padStart(2, '0');
              return [
                ...prev,
                {
                  id: collector.assignedRouteId,
                  code: `RUTA-MED-${newRouteNumber}`,
                  name: collector.routeZone || `Ruta ${newRouteNumber}`,
                  zone: collector.routeZone || 'Centro',
                  organizationId: currentTenantId,
                  collectorName: collector.name,
                  collectorPhone: collector.phone || '+57 314 000 0000',
                  baseFloatingCapital: 0,
                  fixedDailyOpex: 45000,
                  collectorCommissionRate: 3.5,
                  targetRecoveryRate: 95.0,
                  activeLoansCount: 0,
                  totalPortfolio: 0,
                  dailyGrossExpected: 0,
                  dailyGrossCollected: 0,
                  dailyExpenses: 0,
                  par1Rate: 0,
                  par7Rate: 0,
                  par30Rate: 0,
                  status: 'activa',
                },
              ];
            });
          }}
          onRestructureLoan={handleRestructureLoan}
          onToggleClientBlock={handleToggleClientBlock}
          onReassignClientRoute={handleReassignClientRoute}
          onConfirmReconciliation={handleConfirmReconciliation}
          onOpenNewClientModal={() => setShowNewClientModal(true)}
        />
      </main>

      {showNewClientModal && (
        <NewClientLoanModal
          routes={tenantRoutes}
          clients={tenantClients}
          onClose={() => setShowNewClientModal(false)}
          onClientCreated={handleClientCreated}
          onLoanCreatedForExistingClient={handleLoanCreatedForExistingClient}
        />
      )}
    </div>
  );

  // =========================================================================
  // PASO 2 y 3: PUERTA TRASERA DE RESCATE POR CORREO Y AISLAMIENTO DE ROLES
  // =========================================================================
  if (profile?.role === 'super_admin' || session?.user?.email === 'estebanochoamesa@gmail.com') {
    return <SuperAdminLayout />;
  } else if (profile?.role === 'admin') {
    return <AdminLayout />;
  } else if (profile?.role === 'collector' || profile?.role === 'cobrador') {
    const collectorRoute: RouteData =
      routes.find(r => r.id === profile.assignedRouteId) ||
      (profile.assignedRouteId
        ? {
            id: profile.assignedRouteId,
            code: profile.assignedRouteId.toUpperCase().slice(0, 12),
            name: `Ruta ${profile.fullName}`,
            zone: profile.routeZone || 'Zona Asignada',
            organizationId: profile.organizationId,
            collectorName: profile.fullName,
            collectorPhone: '3000000000',
            baseFloatingCapital: 0,
            fixedDailyOpex: 35000,
            collectorCommissionRate: 10,
            targetRecoveryRate: 92,
            activeLoansCount: 0,
            totalPortfolio: 0,
            dailyGrossExpected: 0,
            dailyGrossCollected: 0,
            dailyExpenses: 0,
            par1Rate: 0,
            par7Rate: 0,
            par30Rate: 0,
            status: 'activa',
          }
        : routes[0]);

    const collectorClients = clients.filter(
      c => c.routeId === collectorRoute.id || (profile.organizationId && c.organizationId === profile.organizationId)
    );
    const collectorLoans = loans.filter(
      l => l.routeId === collectorRoute.id || (profile.organizationId && l.organizationId === profile.organizationId)
    );

    return (
      <>
        <CollectorLayout
          currentRoute={collectorRoute}
          clients={collectorClients}
          loans={collectorLoans}
          expenses={expenses.filter(e => e.routeId === collectorRoute.id)}
          ledger={ledger.filter(led => led.routeId === collectorRoute.id)}
          activeCollectorBase={collectorBases.find(b => b.routeId === collectorRoute.id && b.status === 'ACTIVA') || null}
          onRegisterPayment={handleRegisterPayment}
          onRegisterExpense={handleRegisterExpense}
          onConfirmReconciliation={handleConfirmReconciliation}
          onRegisterNewClient={handleClientCreated}
          onCreateLoanForExistingClient={handleLoanCreatedForExistingClient}
          onSyncDatabase={syncDatabaseClients}
          onOpenNewClientModal={handleCollectorOpenNewClientModal}
          logout={logout}
          collectorName={profile.fullName}
        />
        {showNewClientModal && (
          <NewClientLoanModal
            routes={[collectorRoute, ...routes.filter(r => r.id !== collectorRoute.id)]}
            clients={collectorClients}
            onClose={() => setShowNewClientModal(false)}
            onClientCreated={handleClientCreated}
            onLoanCreatedForExistingClient={handleLoanCreatedForExistingClient}
          />
        )}
      </>
    );
  } else {
    // Si el rol no es reconocido, cerrar sesión y enviar a inicio
    return (
      <div className="min-h-screen bg-[#0d1b2a] text-slate-100 flex flex-col justify-center items-center p-4 text-center">
        <h2 className="text-2xl font-bold mb-4">Rol no autorizado o desconocido</h2>
        <p className="text-slate-400 mb-6">Redirigiendo a la página de inicio...</p>
        <button
          onClick={logout}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all"
        >
          Volver al Inicio
        </button>
      </div>
    );
  }
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
