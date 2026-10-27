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
import { NewClientLoanModal } from './components/NewClientLoanModal';
import { UnifiedLoginView } from './components/UnifiedLoginView';
import { ResponsiveAppShell, ActiveRole, ViewportMode } from './components/ResponsiveAppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useOnlineStatus, syncOfflineQueueWithServer, enqueueOfflinePayment } from './utils/offlineSync';
import { fetchClientsAndLoansFromDB } from './services/clientSyncService';
import { roundCOP, validatePaymentAmount } from './utils/financialCalculations';
import { Par30AlertBanner, Par30AlertItem } from './components/Par30AlertBanner';

export type { ActiveRole };

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
  const [collectorBases, setCollectorBases] = useState<CollectorBase[]>(INITIAL_COLLECTOR_BASES);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(INITIAL_AUDIT_LOGS);
  const [showNewClientModal, setShowNewClientModal] = useState<boolean>(false);

  // Estado global de alertas PAR 30 (Mora >= 30 días) y despachos de cobro prejurídico
  const [activeAlerts, setActiveAlerts] = useState<Par30AlertItem[]>([]);
  const [legalDispatches, setLegalDispatches] = useState<Record<string, boolean>>({});

  // Aislamiento Multi-Tenant estricto por organization_id (tenant_id)
  const isSuperAdminRole = role === 'super_admin';
  const currentTenantId = profile?.organizationId || 'org-medellin-01';

  const tenantRoutes = isSuperAdminRole
    ? routes
    : routes.filter((r) => (r.organizationId || 'org-medellin-01') === currentTenantId);
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

  // Hook useEffect global que monitorea el estado 'loans' del tenant activo y filtra por 'daysOverdue >= 30' (PAR 30)
  useEffect(() => {
    if (isSuperAdminRole) {
      setActiveAlerts([]);
      return;
    }

    const par30Loans = tenantLoans.filter(
      (loan) => loan.daysOverdue >= 30 && loan.status !== 'liquidado'
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

  // Estado de conexión y latencia con Cloud SQL
  const [cloudSqlStatus, setCloudSqlStatus] = useState<'connected' | 'offline' | 'checking'>('checking');
  const [cloudSqlLatency, setCloudSqlLatency] = useState<number | null>(null);

  // Función centralizada para consultar SELECT('*') de clients y loans desde Supabase / Cloud SQL
  const syncDatabaseClients = async () => {
    const { data, error } = await fetchClientsAndLoansFromDB();
    if (error) {
      console.error('❌ [Error al sincronizar listado de clientes]:', error);
      return;
    }
    if (data) {
      setClients(data.clients);
      setLoans(data.loans);
      // Recalcular métricas de cartera por ruta con base en los préstamos cargados
      setRoutes(prevRoutes =>
        prevRoutes.map(r => {
          const rLoans = data.loans.filter(l => l.routeId === r.id && l.status !== 'liquidado');
          return {
            ...r,
            activeLoansCount: rLoans.length,
            totalPortfolio: rLoans.reduce((sum, l) => sum + l.remainingBalance, 0),
            dailyGrossExpected: rLoans.reduce((sum, l) => sum + l.installmentAmount, 0),
          };
        })
      );
    }
  };

  // Sincronización en tiempo real con Supabase / Cloud SQL al montar, iniciar sesión o cambiar de vista
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

          // 1. Ejecutar SELECT('*') de clients y loans garantizando vinculación de nombres reales
          await syncDatabaseClients();

          // 2. Cargar bases semanales de cobradores desde Cloud SQL
          try {
            const bRes = await fetch('/api/collector-bases');
            if (bRes.ok) {
              const bData = await bRes.json();
              if (isMounted && Array.isArray(bData)) {
                const mappedBases: CollectorBase[] = bData.map((b: any) => ({
                  id: b.id,
                  collectorId: b.collectorId || b.collector_id,
                  collectorName: b.collectorName || b.collector_name || 'Cobrador',
                  routeId: b.routeId || b.route_id || 'route-1',
                  amount: Number(b.amount || 0),
                  weekStartDate: b.weekStartDate || b.week_start_date || new Date().toISOString().split('T')[0],
                  status: (b.status === 'DEVUELTA' ? 'DEVUELTA' : 'ACTIVA') as 'ACTIVA' | 'DEVUELTA',
                  createdAt: b.createdAt || b.created_at || new Date().toISOString()
                }));
                setCollectorBases(mappedBases);

                setRoutes(prevRoutes =>
                  prevRoutes.map(r => {
                    const activeForRoute = mappedBases.find(
                      mb => mb.routeId === r.id && mb.status === 'ACTIVA'
                    );
                    return activeForRoute
                      ? { ...r, baseFloatingCapital: activeForRoute.amount }
                      : r;
                  })
                );
              }
            }
          } catch (syncErr) {
            console.warn('Error sincronizando bases semanales desde Cloud SQL:', syncErr);
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
  }, [isOnline, isAuthenticated, activeRole]);

  // Asignar una nueva Base Semanal a un cobrador (persistida en tabla collector_bases)
  const handleAssignCollectorBase = async (newBase: CollectorBase) => {
    // 1. Actualización optimista inmediata: marcar bases activas previas de ese cobrador/ruta como DEVUELTA
    setCollectorBases(prev => [
      newBase,
      ...prev.map(b =>
        (b.collectorId === newBase.collectorId || b.routeId === newBase.routeId) && b.status === 'ACTIVA'
          ? { ...b, status: 'DEVUELTA' as const }
          : b
      )
    ]);

    // 2. Sincronizar el capital base flotante de la ruta para el arqueo de caja del rutero
    setRoutes(prev =>
      prev.map(r =>
        r.id === newBase.routeId ? { ...r, baseFloatingCapital: newBase.amount } : r
      )
    );

    // 3. Registrar en log de auditoría
    const auditEvent: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: profile?.email || 'admin_cfo@rutacapital.co',
      role: 'Administrador CFO',
      action: 'CIERRE_TURNO_AUDITADO',
      targetEntity: `collector_bases (${newBase.collectorName})`,
      targetId: newBase.id,
      oldValue: 'Sin base activa / Base anterior cerrada',
      newValue: `Base Semanal ACTIVA: $${newBase.amount.toLocaleString()} COP (Semana: ${newBase.weekStartDate})`,
      justification: `Asignación de base semanal de efectivo a ${newBase.collectorName} (${newBase.routeId}).`,
      ipAddress: '190.157.24.81',
      immutableHash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };
    setAuditLogs(prev => [auditEvent, ...prev]);

    // 4. Persistir en Cloud SQL PostgreSQL
    if (isOnline) {
      try {
        await fetch('/api/collector-bases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newBase)
        });
      } catch (err) {
        console.warn('Error guardando base semanal en Cloud SQL:', err);
      }
    }
  };

  // Actualizar el estado de una Base Semanal ('ACTIVA' | 'DEVUELTA')
  const handleUpdateCollectorBaseStatus = async (baseId: string, status: 'ACTIVA' | 'DEVUELTA') => {
    const targetBase = collectorBases.find(b => b.id === baseId);
    setCollectorBases(prev =>
      prev.map(b => (b.id === baseId ? { ...b, status } : b))
    );

    if (targetBase) {
      setRoutes(prev =>
        prev.map(r =>
          r.id === targetBase.routeId
            ? { ...r, baseFloatingCapital: status === 'ACTIVA' ? targetBase.amount : 0 }
            : r
        )
      );
    }

    if (isOnline) {
      try {
        await fetch(`/api/collector-bases/${baseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
      } catch (err) {
        console.warn('Error actualizando estado de base semanal en Cloud SQL:', err);
      }
    }
  };

  const handleClientCreated = (newClient: ClientProfile, newLoan: LoanDetail) => {
    if (isSuperAdminRole) {
      console.error('[RLS Bloqueo Multi-Tenant] super_admin tiene prohibido hacer INSERT en clients o loans.');
      return;
    }
    const clientWithTenant: ClientProfile = {
      ...newClient,
      organizationId: currentTenantId,
    };
    const loanWithTenant: LoanDetail = {
      ...newLoan,
      organizationId: currentTenantId,
    };
    setClients(prev => [clientWithTenant, ...prev]);
    setLoans(prev => [loanWithTenant, ...prev]);
    setRoutes(prev => prev.map(r => {
      if (r.id === newLoan.routeId) {
        return {
          ...r,
          activeLoansCount: r.activeLoansCount + 1,
          totalPortfolio: r.totalPortfolio + newLoan.remainingBalance,
          dailyGrossExpected: r.dailyGrossExpected + newLoan.installmentAmount
        };
      }
      return r;
    }));

    const auditEvent: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: profile?.email || 'admin_cfo@rutacapital.co',
      role: 'Administrador CFO',
      action: 'PRORROGA_PLAZO_AUTORIZADA',
      targetEntity: `clients (${newClient.name}) & loan (${newLoan.code})`,
      targetId: newClient.id,
      oldValue: 'null',
      newValue: `Monto: $${newLoan.principal.toLocaleString()} COP, Tasa: ${newLoan.interestRate}%, Total: $${newLoan.totalDebt.toLocaleString()} COP, Cuota (${newLoan.modality || 'diaria'}): $${newLoan.installmentAmount.toLocaleString()} COP`,
      justification: `Vincular nuevo deudor formal y apertura de microcrédito en ${newClient.neighborhood}.`,
      ipAddress: '190.157.24.81',
      immutableHash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };
    setAuditLogs(prev => [auditEvent, ...prev]);
  };

  const handleLoanCreatedForExistingClient = (newLoan: LoanDetail) => {
    if (isSuperAdminRole) {
      console.error('[RLS Bloqueo Multi-Tenant] super_admin tiene prohibido hacer INSERT en loans.');
      return;
    }
    const loanWithTenant: LoanDetail = {
      ...newLoan,
      organizationId: currentTenantId,
    };
    setLoans(prev => [loanWithTenant, ...prev]);
    setRoutes(prev =>
      prev.map(r => {
        if (r.id === newLoan.routeId) {
          return {
            ...r,
            activeLoansCount: r.activeLoansCount + 1,
            totalPortfolio: r.totalPortfolio + newLoan.remainingBalance,
            dailyGrossExpected: r.dailyGrossExpected + newLoan.installmentAmount
          };
        }
        return r;
      })
    );

    const auditEvent: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: profile?.email || 'admin_cfo@rutacapital.co',
      role: 'Administrador CFO',
      action: 'PRORROGA_PLAZO_AUTORIZADA',
      targetEntity: `loans (${newLoan.code} -> client_id: ${newLoan.clientId})`,
      targetId: newLoan.id,
      oldValue: 'null',
      newValue: `Monto: $${newLoan.principal.toLocaleString()} COP, Tasa: ${newLoan.interestRate}%, Total: $${newLoan.totalDebt.toLocaleString()} COP, Cuota (${newLoan.modality || 'diaria'}): $${newLoan.installmentAmount.toLocaleString()} COP`,
      justification: `Creación de préstamo con monto libre para ${newLoan.clientName}.`,
      ipAddress: '190.157.24.81',
      immutableHash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };
    setAuditLogs(prev => [auditEvent, ...prev]);
  };

  // Registro de pago en calle o billetera (persistencia en tiempo real a Cloud SQL y cola offline)
  const handleRegisterPayment = (
    loanId: string, 
    amount: number, 
    method: 'efectivo' | 'nequi' | 'daviplata', 
    notes: string
  ) => {
    if (isSuperAdminRole) {
      console.error('[RLS Bloqueo Multi-Tenant] super_admin tiene prohibido hacer INSERT/UPDATE en payments y loans.');
      return;
    }
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;

    const preBalance = roundCOP(loan.remainingBalance);
    const validation = validatePaymentAmount(amount, preBalance);
    if (!validation.isValid) {
      console.error('[Validación Financiera COP] Intento de sobrepago bloqueado:', validation.errorMessage);
      return;
    }

    const safeAmount = validation.sanitizedAmount;
    const postBalance = Math.max(0, roundCOP(preBalance - safeAmount));
    const capitalRatio = loan.totalDebt > 0 ? loan.principal / loan.totalDebt : 0.8;
    const principalPortion = roundCOP(safeAmount * capitalRatio);
    const interestPortion = Math.max(0, roundCOP(safeAmount - principalPortion));

    const newEntry: LedgerEntry = {
      id: `led-${Date.now()}`,
      receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
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
          totalCollected: roundCOP(l.totalCollected + safeAmount),
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
          dailyGrossCollected: roundCOP(r.dailyGrossCollected + safeAmount)
        };
      }
      return r;
    }));

    // Enviar a la base de datos Cloud SQL en tiempo real vía backend con try/catch y fallback offline
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
              amount: safeAmount,
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
            amount: safeAmount,
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
        amount: safeAmount,
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
    const targetInstallment = roundCOP(newInstallment ?? (loan.remainingBalance / targetTerm));

    setLoans(prev => prev.map(l => {
      if (l.id === loanId) {
        return {
          ...l,
          termDays: targetTerm,
          installmentAmount: targetInstallment,
          daysOverdue: 0,
          status: 'refinanciado'
        };
      }
      return l;
    }));

    setClients(prev => prev.map(c => {
      if (c.id === loan.clientId) {
        return {
          ...c,
          daysOverdue: 0,
          hasPreventiveBlock: false,
          riskTier: 'B_promedio'
        };
      }
      return c;
    }));

    const auditEvent: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: profile?.email || 'admin_cfo@rutacapital.co',
      role: 'Administrador CFO',
      action: 'REESTRUCTURACION_PLAZO',
      targetEntity: `loans (${loan.clientName})`,
      targetId: loan.id,
      oldValue: `term: ${loan.termDays}d, cuota: $${loan.installmentAmount.toLocaleString()}, mora: ${loan.daysOverdue}d`,
      newValue: `term: ${targetTerm}d, cuota: $${targetInstallment.toLocaleString()}, mora: 0d, status: refinanciado`,
      justification: `Reestructuración autorizada ante mora de ${loan.daysOverdue} días (PAR 30) para recuperar capital en sector.`,
      ipAddress: '190.157.24.81',
      immutableHash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };
    setAuditLogs(prev => [auditEvent, ...prev]);
  };

  const handleInitiateLegalCollection = (alertItem: Par30AlertItem, legalNotes: string) => {
    setLegalDispatches(prev => ({ ...prev, [alertItem.loanId]: true }));

    setClients(prev => prev.map(c => {
      if (c.id === alertItem.clientId) {
        return {
          ...c,
          hasPreventiveBlock: true,
          riskTier: 'X_vetado'
        };
      }
      return c;
    }));

    const auditEvent: AuditLogItem = {
      id: `aud-legal-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: profile?.email || 'admin_cfo@rutacapital.co',
      role: 'Administrador CFO',
      action: 'BLOQUEO_PREVENTIVO',
      targetEntity: `cobro_prejuridico (${alertItem.clientName} - ${alertItem.loanCode})`,
      targetId: alertItem.loanId,
      oldValue: `mora: ${alertItem.daysOverdue} días, estado_legal: sin_iniciar`,
      newValue: `estado_legal: COBRO_PREJURIDICO_ACTIVO, saldo_exigible: $${alertItem.remainingBalance.toLocaleString()} COP`,
      justification: legalNotes,
      ipAddress: '190.157.24.81',
      immutableHash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
      severity: 'alerta_critica'
    };
    setAuditLogs(prev => [auditEvent, ...prev]);
  };

  const handleSimulatePar30Case = () => {
    const suffix = Date.now().toString().slice(-4);
    const newClientId = `cli-par30-${suffix}`;
    const newLoanId = `loan-par30-${suffix}`;
    const simulatedOverdueDays = 31 + Math.floor(Math.random() * 14);
    const simulatedPrincipal = 800000;
    const simulatedTotal = 960000;
    const simulatedRemaining = 720000;
    const simulatedQuota = 40000;

    const newPar30Client: ClientProfile = {
      id: newClientId,
      name: `Deudor PAR-30 #${suffix}`,
      tradeName: `Distribuidora Mayorista #${suffix}`,
      category: 'Comercio / Abarrotes',
      document: `71${suffix}90`,
      phone: '3124589021',
      address: 'Calle 50 # 52-19',
      neighborhood: 'Centro / El Hueco',
      routeId: 'route-1',
      riskTier: 'D_mora_critica',
      daysOverdue: simulatedOverdueDays,
      hasPreventiveBlock: true,
      guarantorName: 'Fiador Solidario Registrado',
      guarantorPhone: '3004567890',
      lat: 6.2518,
      lng: -75.5681
    };

    const newPar30Loan: LoanDetail = {
      id: newLoanId,
      code: `PREST-R1-${suffix}`,
      clientId: newClientId,
      clientName: newPar30Client.name,
      tradeName: newPar30Client.tradeName,
      routeId: 'route-1',
      principal: simulatedPrincipal,
      interestRate: 20,
      totalDebt: simulatedTotal,
      installmentAmount: simulatedQuota,
      termDays: 24,
      modality: 'diaria',
      installmentsPaid: 6,
      totalCollected: simulatedTotal - simulatedRemaining,
      remainingBalance: simulatedRemaining,
      disbursedDate: '2026-08-20',
      dueDate: '2026-09-18',
      daysOverdue: simulatedOverdueDays,
      status: 'mora_severa',
      todayPaid: false
    };

    setClients(prev => [newPar30Client, ...prev]);
    setLoans(prev => [newPar30Loan, ...prev]);
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

  // REGLA CRÍTICA DE ACCESO: PANTALLA DE INICIO OBLIGATORIA (LOGIN INICIAL)
  // La aplicación nunca debe iniciar sesión automáticamente ni mostrar datos antes de autenticarse.
  if (!isAuthenticated && activeRole !== 'client_borrower') {
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
                  title="Ajuste fluido automático"
                >
                  Fluido (Auto)
                </button>
                <button
                  onClick={() => setViewportMode('desktop')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    viewportMode === 'desktop' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Computadora"
                >
                  <Monitor className="w-3 h-3" />
                  <span className="hidden md:inline">Computadora</span>
                </button>
                <button
                  onClick={() => setViewportMode('tablet')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    viewportMode === 'tablet' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Tableta"
                >
                  <Tablet className="w-3 h-3" />
                  <span>Tableta</span>
                </button>
                <button
                  onClick={() => setViewportMode('mobile')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    viewportMode === 'mobile' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Móvil"
                >
                  <Smartphone className="w-3 h-3" />
                  <span>Móvil</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" />
                ACCESO RESTRINGIDO
              </span>
              <PWAInstallButton />
            </div>
          </div>
        </div>

        {/* PANTALLA DE LOGIN INICIAL OBLIGATORIA */}
        <main className={`flex-1 ${getContainerMaxWidth()} flex items-center justify-center p-3 sm:p-4`}>
          <UnifiedLoginView
            onLoginSuccess={(loggedRole) => {
              if (loggedRole === 'collector' || loggedRole === 'cobrador') {
                setActiveRole('collector_street');
              } else if (loggedRole === 'socio') {
                setActiveRole('investor_fund');
              } else {
                setActiveRole('admin_cfo');
              }
            }}
            onOpenClientPortal={() => setActiveRole('client_borrower')}
          />
        </main>
      </div>
    );
  }

  return (
    <ResponsiveAppShell
      activeRole={activeRole}
      onSelectRole={setActiveRole}
      viewportMode={viewportMode}
      onSelectViewportMode={setViewportMode}
      onOpenNewClientModal={() => setShowNewClientModal(true)}
    >
      {/* AVISO OFFLINE */}
      {!isOnline && (
        <div className="mb-4 bg-amber-500 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          <span>Modo Desconectado Activado: Cobros guardados localmente para sincronización posterior.</span>
        </div>
      )}

      {/* BANNER PERSISTENTE SUPERIOR DE ALERTAS PAR 30 (OCULTO PARA SUPER_ADMIN POR PRIVACIDAD FINANCIERA) */}
      {!isSuperAdminRole && (
        <Par30AlertBanner
          activeAlerts={activeAlerts}
          onRestructureLoan={handleRestructureLoan}
          onInitiateLegalCollection={handleInitiateLegalCollection}
          onSimulatePar30Case={handleSimulatePar30Case}
        />
      )}

      {/* VISTA 1: PANEL SUPER ADMIN & ADMINISTRADOR DE FONDOS (CON AISLAMIENTO MULTI-TENANT) */}
      {activeRole === 'admin_cfo' && (
        <AdminRouteGuard 
          requiredRole="admin_or_socio" 
          onRedirectToAuthorized={(roleRedirect) => setActiveRole(roleRedirect as ActiveRole)}
        >
          <AdminInvestorDashboard
            routes={tenantRoutes}
            clients={tenantClients}
            loans={tenantLoans}
            expenses={tenantExpenses}
            ledger={tenantLedger}
            collectorBases={tenantCollectorBases}
            onAssignCollectorBase={isSuperAdminRole ? undefined : handleAssignCollectorBase}
            onUpdateCollectorBaseStatus={isSuperAdminRole ? undefined : handleUpdateCollectorBaseStatus}
            onCollectorCreated={(collector) => {
              if (isSuperAdminRole) return;
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
                    zone: collector.routeZone || 'Centro / El Hueco',
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
            onNavigateToTab={(tab) => setActiveRole(tab as ActiveRole)}
            onOpenNewClientModal={isSuperAdminRole ? undefined : () => setShowNewClientModal(true)}
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
            // Aislamiento de datos RLS: Solo clientes, préstamos, gastos y base semanal de la ruta del rutero
            const routeClients = clients.filter(c => c.routeId === activeRouteId);
            const routeLoans = loans.filter(l => l.routeId === activeRouteId);
            const routeExpenses = expenses.filter(e => e.routeId === activeRouteId);
            const routeLedger = ledger.filter(led => led.routeId === activeRouteId);
            const activeCollectorBase = collectorBases.find(
              b => b.routeId === activeRouteId && b.status === 'ACTIVA'
            ) || null;

            return (
              <CollectorStreetView
                currentRoute={assignedRoute}
                clients={routeClients}
                loans={routeLoans}
                expenses={routeExpenses}
                ledger={routeLedger}
                activeCollectorBase={activeCollectorBase}
                onRegisterPayment={handleRegisterPayment}
                onRegisterExpense={handleRegisterExpense}
                onConfirmReconciliation={handleConfirmReconciliation}
                onRegisterNewClient={handleClientCreated}
                onCreateLoanForExistingClient={handleLoanCreatedForExistingClient}
                onSyncDatabase={syncDatabaseClients}
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
            <h2 className="text-2xl font-bold text-white">
              Gestión de Autenticación & Roles
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Prueba el inicio de sesión para Cobradores en calle o el acceso restringido a Super Admin y Administradores de Fondo.
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

      {/* MODAL DE VINCULACIÓN DE NUEVO CLIENTE & PRÉSTAMO CON MONTO LIBRE */}
      {showNewClientModal && (
        <NewClientLoanModal
          routes={routes}
          clients={clients}
          onClose={() => setShowNewClientModal(false)}
          onClientCreated={handleClientCreated}
          onLoanCreatedForExistingClient={handleLoanCreatedForExistingClient}
        />
      )}
    </ResponsiveAppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
