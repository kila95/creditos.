import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Receipt,
  MapPin,
  CheckCircle2,
  Fuel,
  Smartphone,
  Search,
  Wifi,
  WifiOff,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Lock,
  MessageCircle,
  XCircle,
  Coins,
  UserX,
  Store,
  PhoneCall,
  UserPlus,
  Calculator,
  ClipboardCheck,
  X,
  ArrowRight,
  Clock,
  Calendar,
} from 'lucide-react';
import {
  RouteData,
  ClientProfile,
  LoanDetail,
  RouteExpenseItem,
  LedgerEntry,
  CollectorBase,
} from '../data/mockData';
import {
  formatCOP,
  roundCOP,
  validatePaymentAmount,
} from '../utils/financialCalculations';
import { buildMorningPaymentReminder, sendAutomaticWhatsAppReceipt } from '../utils/whatsappMessaging';
import {
  useOnlineStatus,
  enqueueOfflinePayment,
  getOfflineQueue,
  syncOfflineQueueWithServer,
  OfflineQueueItem,
} from '../utils/offlineSync';
import { DigitalReceiptModal } from './DigitalReceiptModal';
import { DailyCashReconciliationModal } from './DailyCashReconciliationModal';
import { PartialPaymentModal } from './PartialPaymentModal';
import { QuickClientRouteRegistrationModal } from './QuickClientRouteRegistrationModal';
import { isDateTodayLocal } from '../services/clientSyncService';

interface NonPaymentIncident {
  loanId: string;
  reason: 'sin_liquidez' | 'local_cerrado' | 'cliente_ausente' | 'promesa_nequi' | 'rehuso_pago';
  notes: string;
  timestamp: string;
}

interface CollectorStreetViewProps {
  currentRoute: RouteData;
  clients: ClientProfile[];
  loans: LoanDetail[];
  expenses: RouteExpenseItem[];
  ledger: LedgerEntry[];
  activeCollectorBase?: CollectorBase | null;
  onRegisterPayment: (
    loanId: string,
    amount: number,
    method: 'efectivo' | 'nequi' | 'daviplata',
    notes: string
  ) => void;
  onRegisterExpense: (
    category: RouteExpenseItem['category'],
    amount: number,
    description: string
  ) => void;
  onConfirmReconciliation: (
    routeId: string,
    actualCash: number,
    discrepancy: number,
    notes: string
  ) => void;
  onRegisterNewClient?: (client: ClientProfile, loan: LoanDetail) => void;
  onCreateLoanForExistingClient?: (loan: LoanDetail) => void;
  onSyncDatabase?: () => Promise<void> | void;
  onOpenNewClientModal?: () => void;
}

interface NewClientButtonContainerProps {
  onOpenNewClientModal: () => void;
}

const NewClientButtonContainer: React.FC<NewClientButtonContainerProps> = React.memo(({ onOpenNewClientModal }) => {
  return (
    <div className="new-client-button-container transform-gpu">
      <button
        type="button"
        onClick={onOpenNewClientModal}
        className="w-full min-h-[48px] py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer select-none"
      >
        <UserPlus className="w-4 h-4" />
        <span>+ Nuevo Cliente o Préstamo en Ruta</span>
      </button>
    </div>
  );
});

NewClientButtonContainer.displayName = 'NewClientButtonContainer';

export const CollectorStreetView: React.FC<CollectorStreetViewProps> = ({
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
}) => {
  const browserOnline = useOnlineStatus();
  // Permite simular modo sin señal en zonas urbanas complejas o responder al estado real de red
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const isOnline = browserOnline && !simulatedOffline;

  // useCallback para evitar re-renderizaciones innecesarias del botón Nuevo Cliente
  const handleOpenNewClientModal = React.useCallback(() => {
    if (onOpenNewClientModal) {
      onOpenNewClientModal();
    } else {
      setQuickRegisterModalOpen(true);
    }
  }, [onOpenNewClientModal]);

  // Vista activa del cobrador: 'route_list' (Recorrido de Clientes) o 'shift_closing' (Resumen de Cierre de Turno)
  const [collectorTab, setCollectorTab] = useState<'route_list' | 'shift_closing'>('route_list');

  // Buscador instantáneo por Nombre o Teléfono
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'collected' | 'incidents'>(
    'all'
  );
  // Filtro por días programados (payment_days) para la ruta del cobrador
  const [onlyScheduledToday, setOnlyScheduledToday] = useState(true);

  // Modales operativos
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [reconciliationModalOpen, setReconciliationModalOpen] = useState(false);
  const [quickRegisterModalOpen, setQuickRegisterModalOpen] = useState(false);

  const [selectedLoan, setSelectedLoan] = useState<LoanDetail | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<{
    entry: LedgerEntry;
    client: ClientProfile;
    loan: LoanDetail;
  } | null>(null);

  // Alerta de validación de pagos en calle
  const [streetAlert, setStreetAlert] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  // Registro de novedades (No Pagó)
  const [incidents, setIncidents] = useState<Record<string, NonPaymentIncident>>({});

  // Cola offline local
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>(getOfflineQueue());
  const [isSyncing, setIsSyncing] = useState(false);

  // Incident form states
  const [incidentReason, setIncidentReason] =
    useState<NonPaymentIncident['reason']>('sin_liquidez');
  const [incidentNotes, setIncidentNotes] = useState('');

  // Expense form states
  const [expenseCategory, setExpenseCategory] =
    useState<RouteExpenseItem['category']>('combustible_moto');
  const [expenseAmount, setExpenseAmount] = useState<number>(20000);
  const [expenseDescription, setExpenseDescription] = useState('');

  // Cargar datos desde Supabase / Cloud SQL con manejo de errores robusto
  useEffect(() => {
    const loadRouteData = async () => {
      try {
        if (onSyncDatabase) {
          await onSyncDatabase();
        }
        setOfflineQueue(getOfflineQueue());
      } catch (err) {
        console.error('[Error sincronizando ruta en calle]:', err);
      }
    };
    loadRouteData();
  }, [currentRoute.id]);

  // 1. FILTRADO ESTRICTO POR RUTA ASIGNADA Y EXCLUSIÓN DE CRÉDITOS LIQUIDADOS
  const routeClients = clients.filter((c) => c.routeId === currentRoute.id);
  const rawRouteLoans = loans
    .filter(
      (l) =>
        l.routeId === currentRoute.id &&
        l.status !== 'liquidado' &&
        l.status !== 'liquidated' &&
        l.status !== 'completed' &&
        roundCOP(l.remainingBalance) > 0
    )
    .map((l) => {
      const matchedClient = routeClients.find((c) => c.id === l.clientId);
      return {
        ...l,
        clientName: matchedClient ? matchedClient.name : l.clientName,
        tradeName: matchedClient ? matchedClient.tradeName || matchedClient.name : l.tradeName,
        principal: roundCOP(l.principal),
        totalDebt: roundCOP(l.totalDebt),
        installmentAmount: roundCOP(l.installmentAmount),
        remainingBalance: roundCOP(l.remainingBalance),
      };
    });

  // Garantizar que únicamente clientes verdaderamente sin ningún préstamo registrado aparezcan como huérfanos
  const allLoanClientIds = new Set(loans.map((l) => l.clientId));
  const orphanClientLoans: LoanDetail[] = routeClients
    .filter((c) => !allLoanClientIds.has(c.id))
    .map((c) => ({
      id: `loan-sync-${c.id}`,
      code: `PREST-${c.id.slice(-4).toUpperCase()}`,
      clientId: c.id,
      clientName: c.name,
      tradeName: c.tradeName || c.name,
      routeId: c.routeId,
      principal: 500000,
      interestRate: 20,
      totalDebt: 600000,
      installmentAmount: 25000,
      termDays: 24,
      installmentsPaid: 0,
      totalCollected: 0,
      remainingBalance: 600000,
      disbursedDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      daysOverdue: 0,
      status: 'activo',
      todayPaid: false,
    }));

  const routeLoans = [...rawRouteLoans, ...orphanClientLoans];

  // 2. FILTRADO INTELIGENTE SEGÚN MODALIDAD (diaria/semanal -> getDay(), quincenal/mensual -> getDate())
  const now = new Date();
  const currentWeekDay = now.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sáb
  const currentMonthDate = now.getDate(); // 1 - 31
  const DAYS_SPANISH = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const currentDayName = DAYS_SPANISH[currentWeekDay];

  const isLoanScheduledToday = (l: LoanDetail) => {
    if (!l.paymentDays || !Array.isArray(l.paymentDays) || l.paymentDays.length === 0) {
      return true; // Si no está especificado, incluir para compatibilidad
    }

    const modality = l.modality || 'diaria';

    if (modality === 'diaria' || modality === 'semanal') {
      // Filtrar comparando con getDay() (día de la semana actual 0-6)
      return l.paymentDays.includes(currentWeekDay);
    } else {
      // Filtrar comparando con getDate() (fecha del mes actual 1-31, ej: [15, 30] o [12])
      if (l.paymentDays.includes(30) && currentMonthDate >= 28) {
        const isLastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === currentMonthDate;
        if (isLastDayOfMonth) return true;
      }
      return l.paymentDays.includes(currentMonthDate);
    }
  };

  const todayScheduledLoansCount = routeLoans.filter(isLoanScheduledToday).length;

  // 3. BUSCADOR INSTANTÁNEO POR NOMBRE, TELÉFONO, NEGOCIO O CÉDULA
  const normalizedQuery = searchTerm.trim().toLowerCase();
  const digitsOnlyQuery = searchTerm.replace(/\D/g, '');

  const filteredLoans = routeLoans.filter((l) => {
    const client = routeClients.find((c) => c.id === l.clientId);
    const clientPhone = client?.phone || '';
    const clientPhoneDigits = clientPhone.replace(/\D/g, '');
    const clientDoc = client?.document || '';

    const matchesSearch =
      !normalizedQuery ||
      l.clientName.toLowerCase().includes(normalizedQuery) ||
      l.tradeName.toLowerCase().includes(normalizedQuery) ||
      clientPhone.toLowerCase().includes(normalizedQuery) ||
      (digitsOnlyQuery.length > 0 && clientPhoneDigits.includes(digitsOnlyQuery)) ||
      clientDoc.toLowerCase().includes(normalizedQuery) ||
      l.code.toLowerCase().includes(normalizedQuery);

    const hasIncident = Boolean(incidents[l.id]);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'collected' && l.todayPaid) ||
      (statusFilter === 'pending' && !l.todayPaid && !hasIncident) ||
      (statusFilter === 'incidents' && hasIncident);

    const matchesDaySchedule = !onlyScheduledToday || isLoanScheduledToday(l);

    return matchesSearch && matchesStatus && matchesDaySchedule;
  })
  .sort((a, b) => {
    // Ordenamiento cronológico por fecha de desembolso / creación en el sistema
    const dateA = a.disbursedDate || '';
    const dateB = b.disbursedDate || '';
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    return a.id.localeCompare(b.id);
  });

  // 3. MÉTRICAS FINANCIERAS DEL TURNO EN ENTEROS EXACTOS COP
  const routeExpensesToday = expenses.filter((e) => e.routeId === currentRoute.id);
  const totalRouteExpenses = roundCOP(
    routeExpensesToday.reduce((acc, e) => acc + roundCOP(e.amount), 0)
  );

  const routeLedgerToday = ledger.filter((entry) => entry.routeId === currentRoute.id && isDateTodayLocal(entry.timestamp));
  const digitalCollectedToday = roundCOP(
    routeLedgerToday
      .filter((entry) => entry.paymentMethod !== 'efectivo')
      .reduce((acc, entry) => acc + roundCOP(entry.amount), 0)
  );

  const cashCollectedToday = roundCOP(currentRoute.dailyGrossCollected);
  const activeBaseAmount = roundCOP(
    activeCollectorBase && activeCollectorBase.status === 'ACTIVA'
      ? activeCollectorBase.amount
      : currentRoute.baseFloatingCapital
  );

  // Efectivo físico neto que el cobrador tiene en bolsillo para entregar al Administrador
  const cashInHand = roundCOP(activeBaseAmount + cashCollectedToday - totalRouteExpenses);

  // ACCIÓN 1: COBRAR CUOTA DE HOY EN EFECTIVO
  const handleQuickPayQuota = (loan: LoanDetail) => {
    setStreetAlert(null);
    const currentBalance = roundCOP(loan.remainingBalance);

    if (currentBalance <= 0) {
      setStreetAlert({
        type: 'error',
        message: `El préstamo de ${loan.clientName} ya tiene saldo $0 COP (Liquidado). No se pueden registrar pagos adicionales.`,
      });
      return;
    }

    // Si la cuota pactada es mayor al saldo restante final, ajustar exactamente al saldo pendiente
    const targetAmount = Math.min(roundCOP(loan.installmentAmount), currentBalance);
    const validation = validatePaymentAmount(targetAmount, currentBalance);

    if (!validation.isValid) {
      setStreetAlert({
        type: 'error',
        message: validation.errorMessage || 'Monto de pago inválido.',
      });
      return;
    }

    const cleanAmount = validation.sanitizedAmount;
    const client = clients.find((c) => c.id === loan.clientId);

    onRegisterPayment(
      loan.id,
      cleanAmount,
      'efectivo',
      isOnline
        ? 'Pago cuota en efectivo (Terminal de Calle)'
        : 'Pago cuota en efectivo (Guardado localmente en Modo Offline)'
    );

    if (incidents[loan.id]) {
      const nextIncidents = { ...incidents };
      delete nextIncidents[loan.id];
      setIncidents(nextIncidents);
    }

    if (!isOnline && client) {
      enqueueOfflinePayment({
        loanId: loan.id,
        clientId: client.id,
        clientName: client.name,
        amount: cleanAmount,
        paymentMethod: 'efectivo',
        notes: 'Cobro en calle guardado localmente (Offline)',
        timestamp: new Date().toISOString(),
        gpsLocation: `${client.lat} N, ${client.lng} W`,
      });
      setOfflineQueue(getOfflineQueue());
    }

    setStreetAlert({
      type: 'success',
      message: isOnline
        ? `Pago de ${formatCOP(cleanAmount)} registrado para ${loan.clientName}. Nuevo saldo: ${formatCOP(currentBalance - cleanAmount)}.`
        : `Pago de ${formatCOP(cleanAmount)} guardado localmente (Offline) para ${loan.clientName}.`,
    });

    if (client) {
      const principalPortion = roundCOP(cleanAmount * (loan.principal / Math.max(1, loan.totalDebt)));
      const interestPortion = Math.max(0, cleanAmount - principalPortion);
      const entry: LedgerEntry = {
        id: `led-${Date.now()}`,
        receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
        loanId: loan.id,
        clientId: client.id,
        clientName: client.name,
        routeId: loan.routeId,
        amount: cleanAmount,
        principalPortion,
        interestPortion,
        paymentMethod: 'efectivo',
        preBalance: currentBalance,
        postBalance: Math.max(0, currentBalance - cleanAmount),
        timestamp: new Date().toISOString(),
        gpsLocation: '6.2518 N, -75.6142 W',
        hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
      };
      setActiveReceipt({ entry, client, loan });
      if (client.phone) {
        sendAutomaticWhatsAppReceipt({
          phone: client.phone,
          amount: cleanAmount,
          remainingBalance: Math.max(0, currentBalance - cleanAmount),
          clientName: client.name,
          receiptNumber: entry.receiptNumber
        }).catch((err) => console.warn('Automatic WhatsApp receipt error:', err));
      }
    }
  };

  // ACCIÓN DE LIQUIDACIÓN COMPLETA DE DEUDA ($ remainingBalance TOTAL)
  const handleLiquidateDebt = (loan: LoanDetail) => {
    setStreetAlert(null);
    const currentBalance = roundCOP(loan.remainingBalance);

    if (currentBalance <= 0) {
      setStreetAlert({
        type: 'error',
        message: `El préstamo de ${loan.clientName} ya se encuentra liquidado ($0 COP).`,
      });
      return;
    }

    const client = clients.find((c) => c.id === loan.clientId);

    // Registrar pago por la TOTALIDAD del saldo restante
    onRegisterPayment(
      loan.id,
      currentBalance,
      'efectivo',
      isOnline
        ? 'LIQUIDACIÓN TOTAL DE DEUDA (Pago completo registrado en calle)'
        : 'LIQUIDACIÓN TOTAL DE DEUDA (Guardado localmente en Modo Offline)'
    );

    if (incidents[loan.id]) {
      const nextIncidents = { ...incidents };
      delete nextIncidents[loan.id];
      setIncidents(nextIncidents);
    }

    if (!isOnline && client) {
      enqueueOfflinePayment({
        loanId: loan.id,
        clientId: client.id,
        clientName: client.name,
        amount: currentBalance,
        paymentMethod: 'efectivo',
        notes: 'Liquidación total de deuda (Offline)',
        timestamp: new Date().toISOString(),
        gpsLocation: `${client.lat} N, ${client.lng} W`,
      });
      setOfflineQueue(getOfflineQueue());
    }

    setStreetAlert({
      type: 'success',
      message: `Deuda de ${loan.clientName} LIQUIDADA COMPLETAMENTE por ${formatCOP(currentBalance)}. Saldo restante: $0 COP.`,
    });

    if (client) {
      const principalPortion = roundCOP(currentBalance * (loan.principal / Math.max(1, loan.totalDebt)));
      const interestPortion = Math.max(0, currentBalance - principalPortion);
      const entry: LedgerEntry = {
        id: `led-${Date.now()}`,
        receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
        loanId: loan.id,
        clientId: client.id,
        clientName: client.name,
        routeId: loan.routeId,
        amount: currentBalance,
        principalPortion,
        interestPortion,
        paymentMethod: 'efectivo',
        preBalance: currentBalance,
        postBalance: 0,
        timestamp: new Date().toISOString(),
        gpsLocation: '6.2518 N, -75.6142 W',
        hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
      };
      setActiveReceipt({ entry, client, loan: { ...loan, remainingBalance: 0, status: 'liquidado' } });
      if (client.phone) {
        sendAutomaticWhatsAppReceipt({
          phone: client.phone,
          amount: currentBalance,
          remainingBalance: 0,
          clientName: client.name,
          receiptNumber: entry.receiptNumber
        }).catch((err) => console.warn('Automatic WhatsApp receipt error:', err));
      }
    }
  };

  // ACCIÓN 2: ABRIR MODAL DE ABONO PARCIAL O PAGO PERSONALIZADO
  const openPartialPaymentModal = (loan: LoanDetail) => {
    setStreetAlert(null);
    if (roundCOP(loan.remainingBalance) <= 0) {
      setStreetAlert({
        type: 'error',
        message: `El cliente ${loan.clientName} no tiene saldo pendiente por cobrar ($0 COP).`,
      });
      return;
    }
    setSelectedLoan(loan);
    setPaymentModalOpen(true);
  };

  // ACCIÓN 3: ABRIR MODAL DE REGISTRAR NOVEDAD (NO PAGÓ)
  const openIncidentModal = (loan: LoanDetail) => {
    setSelectedLoan(loan);
    setIncidentReason('sin_liquidez');
    setIncidentNotes('');
    setIncidentModalOpen(true);
  };

  const handleConfirmIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    const newIncident: NonPaymentIncident = {
      loanId: selectedLoan.id,
      reason: incidentReason,
      notes: incidentNotes,
      timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
    };

    setIncidents((prev) => ({ ...prev, [selectedLoan.id]: newIncident }));
    setIncidentModalOpen(false);
  };

  const submitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanExpense = roundCOP(expenseAmount);
    if (cleanExpense <= 0) return;
    onRegisterExpense(
      expenseCategory,
      cleanExpense,
      expenseDescription || 'Gasto operacional registrado en calle'
    );
    setExpenseModalOpen(false);
    setExpenseAmount(20000);
    setExpenseDescription('');
  };

  const handleSyncOfflineQueue = async () => {
    setIsSyncing(true);
    try {
      const { syncedCount } = await syncOfflineQueueWithServer();
      setOfflineQueue(getOfflineQueue());
      setStreetAlert({
        type: 'success',
        message:
          syncedCount > 0
            ? `Se sincronizaron ${syncedCount} cobro(s) pendientes con el servidor.`
            : 'Cola local sincronizada correctamente.',
      });
    } catch (err) {
      console.error('Error sincronizando cola offline:', err);
      setStreetAlert({
        type: 'error',
        message: 'No se pudo sincronizar la cola local. Se reintentará al recuperar señal.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSendMorningReminder = (loan: LoanDetail) => {
    const client = clients.find((c) => c.id === loan.clientId);
    if (!client) return;
    const reminder = buildMorningPaymentReminder(client, loan);
    window.open(reminder.whatsappUrl, '_blank');
  };

  const getIncidentLabel = (reason: NonPaymentIncident['reason']) => {
    switch (reason) {
      case 'sin_liquidez':
        return 'Sin liquidez hoy · Pidió prórroga';
      case 'local_cerrado':
        return 'Local / Puesto cerrado';
      case 'cliente_ausente':
        return 'Cliente no se encontraba';
      case 'promesa_nequi':
        return 'Prometió transferencia tarde';
      case 'rehuso_pago':
        return 'Rehusó pagar / Incidencia';
      default:
        return 'Novedad registrada';
    }
  };

  const paidLoansCount = routeLoans.filter((l) => l.todayPaid).length;
  const pendingLoansCount = routeLoans.filter((l) => !l.todayPaid && !incidents[l.id]).length;

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-20">
      {/* =====================================================================
          1. BARRA DE ESTADO DE CONEXIÓN (ONLINE / OFFLINE GUARDADO LOCALMENTE)
         ===================================================================== */}
      <div
        className={`rounded-xl border p-3.5 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
          isOnline
            ? 'bg-slate-900 border-slate-800'
            : 'bg-amber-950/40 border-amber-500/40'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isOnline
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
            }`}
          >
            {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-xs font-bold ${
                  isOnline ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {isOnline ? 'Estado: Online' : 'Estado: Offline (Guardado localmente)'}
              </span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="text-xs text-slate-300 font-medium">
                {currentRoute.name} ({currentRoute.collectorName})
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isOnline
                ? 'Sincronización en tiempo real activa con Supabase / PostgreSQL.'
                : 'Zona sin cobertura móvil: Todos los pagos y clientes nuevos se guardan en la memoria del teléfono.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {offlineQueue.length > 0 && (
            <button
              type="button"
              onClick={handleSyncOfflineQueue}
              disabled={!isOnline || isSyncing}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-400 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sincronizar ({offlineQueue.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSimulatedOffline((prev) => !prev)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              simulatedOffline
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            {simulatedOffline ? 'Volver a Online' : 'Simular Zona Sin Señal'}
          </button>
        </div>
      </div>

      {/* ALERTA DE VALIDACIÓN O CONFIRMACIÓN DE COBRO */}
      {streetAlert && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            streetAlert.type === 'error'
              ? 'bg-rose-950/70 border-rose-500/50 text-rose-200'
              : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {streetAlert.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{streetAlert.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStreetAlert(null)}
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          2. SELECTOR PRINCIPAL DE MODO OPERATIVO (RUTA DE CALLE VS CIERRE DE TURNO)
         ===================================================================== */}
      <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800 shadow-sm">
        <button
          type="button"
          onClick={() => setCollectorTab('route_list')}
          className={`min-h-[46px] py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            collectorTab === 'route_list'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Clientes en Ruta ({routeLoans.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setCollectorTab('shift_closing')}
          className={`min-h-[46px] py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            collectorTab === 'shift_closing'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Resumen de Cierre de Turno</span>
        </button>
      </div>

      {/* =====================================================================
          VISTA A: RESUMEN DE CIERRE DE TURNO Y ARQUEO DE CAJA CON EL ADMINISTRADOR
         ===================================================================== */}
      {collectorTab === 'shift_closing' ? (
        <div className="space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Liquidación Diaria de Ruta</span>
                  <span aria-hidden="true">·</span>
                  <span>{currentRoute.name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-emerald-400">Enteros Exactos COP</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mt-1">
                  Resumen de Cierre de Turno — {currentRoute.collectorName}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verificación del efectivo recaudado hoy, base semanal y gastos operativos antes de entregar el sobre al Administrador.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReconciliationModalOpen(true)}
                className="min-h-[48px] px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
              >
                <Calculator className="w-4 h-4" />
                <span>Firmar Arqueo de Caja con Admin</span>
              </button>
            </div>

            {/* 4 TARJETAS DE LIQUIDACIÓN DEL TURNO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-indigo-300 font-medium block">
                  1. Base Semanal en Poder
                </span>
                <span className="text-xl font-bold text-white font-mono tabular-nums mt-1 block">
                  {formatCOP(activeBaseAmount)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Capital inicial entregado por Admin
                </span>
              </div>

              <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4">
                <span className="text-xs text-emerald-300 font-medium block">
                  2. Efectivo Recaudado Hoy
                </span>
                <span className="text-xl font-bold text-emerald-400 font-mono tabular-nums mt-1 block">
                  +{formatCOP(cashCollectedToday)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {paidLoansCount} de {routeLoans.length} clientes cobrados
                </span>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-amber-300 font-medium block">
                  3. Gastos de Ruta (OpEx)
                </span>
                <span className="text-xl font-bold text-amber-300 font-mono tabular-nums mt-1 block">
                  -{formatCOP(totalRouteExpenses)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {routeExpensesToday.length} gasto(s) registrados hoy
                </span>
              </div>

              <div className="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-4">
                <span className="text-xs text-indigo-200 font-semibold block">
                  4. Total Efectivo a Entregar
                </span>
                <span className="text-2xl font-bold text-white font-mono tabular-nums mt-1 block">
                  {formatCOP(cashInHand)}
                </span>
                <span className="text-[11px] text-indigo-300 mt-1 block">
                  Base + Cobrado − Gastos
                </span>
              </div>
            </div>

            {/* ESTADÍSTICAS DEL RECORRIDO HOY */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Clientes Cobrados Hoy</span>
                  <span className="text-lg font-bold text-emerald-400 font-mono tabular-nums">
                    {paidLoansCount} clientes
                  </span>
                </div>
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Clientes Pendientes</span>
                  <span className="text-lg font-bold text-amber-300 font-mono tabular-nums">
                    {pendingLoansCount} clientes
                  </span>
                </div>
                <Clock className="w-6 h-6 text-amber-400" />
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Transferencias (Nequi/Daviplata)</span>
                  <span className="text-lg font-bold text-indigo-300 font-mono tabular-nums">
                    {formatCOP(digitalCollectedToday)}
                  </span>
                </div>
                <Smartphone className="w-6 h-6 text-indigo-400" />
              </div>
            </div>

            {/* DETALLE DE RECAUDOS DEL DÍA */}
            <div className="pt-2">
              <h4 className="text-sm font-bold text-white mb-3">
                Detalle de Pagos Recibidos en el Turno ({routeLedgerToday.length})
              </h4>

              {routeLedgerToday.length === 0 ? (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400">
                  Aún no se han registrado cobros en esta ruta durante el turno actual.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Recibo</th>
                        <th className="py-2.5 px-3">Cliente</th>
                        <th className="py-2.5 px-3">Método</th>
                        <th className="py-2.5 px-3 text-right">Monto Recaudado</th>
                        <th className="py-2.5 px-3 text-right">Saldo Posterior</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 bg-slate-900/60">
                      {routeLedgerToday.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-mono text-slate-300">
                            {item.receiptNumber}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-white">
                            {item.clientName}
                          </td>
                          <td className="py-2.5 px-3 capitalize text-slate-300">
                            {item.paymentMethod}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400 tabular-nums">
                            +{formatCOP(item.amount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300 tabular-nums">
                            {formatCOP(item.postBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* BOTONES FINALES DE CIERRE */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={() => setCollectorTab('route_list')}
                className="min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Volver al Listado de Clientes</span>
              </button>
              <button
                type="button"
                onClick={() => setReconciliationModalOpen(true)}
                className="min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Abrir Conteo de Billetes y Cerrar Turno</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* =====================================================================
           VISTA B: RECORRIDO DE CALLE, BUSCADOR INSTANTÁNEO Y TARJETAS TÁCTILES
           ===================================================================== */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* COLUMNA IZQUIERDA: CAJA EN BOLSILLO Y ACCIONES DE RUTA */}
          <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-20">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
              {/* Efectivo Físico en Mano */}
              <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-emerald-400 font-semibold block">
                    Efectivo Físico en Bolsillo
                  </span>
                  <span className="text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums mt-0.5 block">
                    {formatCOP(cashInHand)}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    Base ({formatCOP(activeBaseAmount)}) + Recaudo ({formatCOP(cashCollectedToday)})
                  </span>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>

              {/* Resumen compacto */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-indigo-300 block font-medium">Base Activa</span>
                  <span className="text-xs sm:text-sm font-bold text-white font-mono tabular-nums mt-0.5 block">
                    {formatCOP(activeBaseAmount)}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-emerald-300 block font-medium">Cobrado Hoy</span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-400 font-mono tabular-nums mt-0.5 block">
                    +{formatCOP(cashCollectedToday)}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-amber-300 block font-medium">Gastos Ruta</span>
                  <span className="text-xs sm:text-sm font-bold text-amber-300 font-mono tabular-nums mt-0.5 block">
                    -{formatCOP(totalRouteExpenses)}
                  </span>
                </div>
              </div>

              {/* Botón Nuevo Cliente optimizado con React.memo y useCallback */}
              <NewClientButtonContainer onOpenNewClientModal={handleOpenNewClientModal} />

              {/* Botones secundarios grandes para celular */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(true)}
                  className="min-h-[44px] py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Fuel className="w-4 h-4 text-amber-400" />
                  <span>Registrar Gasto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCollectorTab('shift_closing')}
                  className="min-h-[44px] py-2.5 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ClipboardCheck className="w-4 h-4 text-indigo-400" />
                  <span>Cierre de Turno</span>
                </button>
              </div>

              {/* Progreso del Recorrido */}
              <div className="space-y-1.5 text-xs pt-2 border-t border-slate-800">
                <div className="flex justify-between text-slate-300">
                  <span>Avance del Día:</span>
                  <span className="font-bold font-mono text-emerald-400 tabular-nums">
                    {paidLoansCount} de {routeLoans.length} cobrados
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(paidLoansCount / Math.max(1, routeLoans.length)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA: BUSCADOR INSTANTÁNEO Y TARJETAS DE CLIENTES */}
          <div className="lg:col-span-8 space-y-4">
            {/* ENCABEZADO DE COBROS PROGRAMADOS PARA HOY */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950/80 border border-indigo-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>Cobros programados para hoy ({currentDayName}):</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30">
                      {todayScheduledLoansCount} clientes
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Filtro automático por días de cobro (<code className="text-emerald-400 font-mono">payment_days</code>)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => setOnlyScheduledToday(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    onlyScheduledToday
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  Solo Hoy ({todayScheduledLoansCount})
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyScheduledToday(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    !onlyScheduledToday
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  Ver Todos ({routeLoans.length})
                </button>
              </div>
            </div>

            {/* BARRA DE BÚSQUEDA INSTANTÁNEA POR NOMBRE O TELÉFONO */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  placeholder="Buscar instantáneamente por nombre del cliente, teléfono (ej. 312...) o negocio..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-white cursor-pointer"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filtros rápidos de estado */}
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  Todos ({routeLoans.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === 'pending'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  Pendientes ({pendingLoansCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('collected')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === 'collected'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  Pagados Hoy ({paidLoansCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('incidents')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === 'incidents'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  Novedades ({Object.keys(incidents).length})
                </button>
              </div>
            </div>

            {/* LISTADO DE CLIENTES CON BOTONES TÁCTILES GRANDES */}
            <div className="space-y-3">
              {filteredLoans.map((loan, index) => {
                const client = clients.find((c) => c.id === loan.clientId);
                const incident = incidents[loan.id];
                const visitNumber = index + 1;
                const effectiveQuota = Math.min(
                  roundCOP(loan.installmentAmount),
                  roundCOP(loan.remainingBalance)
                );

                return (
                  <div
                    key={loan.id}
                    className={`bg-slate-900 border rounded-xl p-4 sm:p-5 shadow-sm transition-colors ${
                      loan.todayPaid
                        ? 'border-emerald-500/40'
                        : incident
                        ? 'border-rose-500/40'
                        : loan.daysOverdue >= 2
                        ? 'border-amber-500/40'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Cabecera de la tarjeta */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                          <span className="font-mono font-semibold text-indigo-400">
                            Parada #{visitNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{loan.tradeName}</span>
                          {loan.todayPaid && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-emerald-400 font-semibold">Cobrado Hoy</span>
                            </>
                          )}
                          {!loan.todayPaid && loan.daysOverdue >= 2 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-400 font-semibold">
                                Mora {loan.daysOverdue}d
                              </span>
                            </>
                          )}
                        </div>

                        <h4 className="text-base font-bold text-white truncate">
                          {loan.clientName}
                        </h4>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 pt-0.5">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{client?.address || 'Sector asignado'}</span>
                          </span>
                          {client?.phone && (
                            <span className="flex items-center gap-1 font-mono text-slate-300">
                              <PhoneCall className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span>{client.phone}</span>
                            </span>
                          )}
                          {loan.paymentDays && Array.isArray(loan.paymentDays) && loan.paymentDays.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 text-[10px] font-mono text-indigo-300 border border-slate-800">
                              <Calendar className="w-3 h-3 text-indigo-400" />
                              <span>
                                {[1, 2, 3, 4, 5, 6, 0]
                                  .filter((d) => loan.paymentDays?.includes(d))
                                  .map((d) => ['D', 'L', 'M', 'M', 'J', 'V', 'S'][d])
                                  .join(' ')}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-medium block">
                          Valor Cuota
                        </span>
                        <span className="text-lg font-bold text-emerald-400 font-mono tabular-nums">
                          {formatCOP(loan.installmentAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Métricas de Saldo en enteros exactos COP */}
                    <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Saldo Pendiente</span>
                        <span className="font-bold text-white font-mono tabular-nums">
                          {formatCOP(loan.remainingBalance)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Progreso Cuotas</span>
                        <span className="font-bold text-slate-200 font-mono tabular-nums">
                          {loan.installmentsPaid} / {loan.termDays}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[11px]">Total Crédito</span>
                        <span className="font-mono text-slate-300 tabular-nums">
                          {formatCOP(loan.totalDebt)}
                        </span>
                      </div>
                    </div>

                    {incident && (
                      <div className="mt-3 p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between">
                        <span>
                          <strong>Novedad ({incident.timestamp}):</strong>{' '}
                          {incident.notes || getIncidentLabel(incident.reason)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openIncidentModal(loan)}
                          className="text-xs text-rose-300 underline font-semibold ml-2 cursor-pointer"
                        >
                          Editar
                        </button>
                      </div>
                    )}

                    {/* BOTONES DE ACCIÓN GRANDES Y TÁCTILES PARA USO EN CELULAR */}
                    <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-2">
                      {loan.todayPaid || loan.remainingBalance <= 0 ? (
                        <div className="flex gap-2">
                          <div className="flex-1 min-h-[46px] py-2.5 px-3 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>
                              {loan.remainingBalance <= 0
                                ? 'Crédito Liquidado ($0 COP)'
                                : 'Pago Registrado Hoy'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (client) {
                                const entry: LedgerEntry = {
                                  id: `led-${Date.now()}`,
                                  receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
                                  loanId: loan.id,
                                  clientId: client.id,
                                  clientName: client.name,
                                  routeId: loan.routeId,
                                  amount: roundCOP(loan.installmentAmount),
                                  principalPortion: roundCOP(loan.installmentAmount * 0.8),
                                  interestPortion: roundCOP(loan.installmentAmount * 0.2),
                                  paymentMethod: 'efectivo',
                                  preBalance: roundCOP(loan.remainingBalance + loan.installmentAmount),
                                  postBalance: roundCOP(loan.remainingBalance),
                                  timestamp: new Date().toISOString(),
                                  gpsLocation: '6.2518 N, -75.6142 W',
                                  hash: Math.random().toString(36).substring(2),
                                };
                                setActiveReceipt({ entry, client, loan });
                              }
                            }}
                            className="min-h-[46px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Receipt className="w-4 h-4 text-emerald-400" />
                            <span>Recibo</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                            {/* Botón 1: Cobrar Cuota de Hoy */}
                            <button
                              type="button"
                              onClick={() => handleQuickPayQuota(loan)}
                              className="sm:col-span-6 min-h-[48px] py-3 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                              <span>Cobrar Cuota ({formatCOP(effectiveQuota)})</span>
                            </button>

                            {/* Botón 2: Liquidar Deuda Total */}
                            <button
                              type="button"
                              onClick={() => handleLiquidateDebt(loan)}
                              className="sm:col-span-6 min-h-[48px] py-3 px-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                              title="Liquidar la totalidad de la deuda restante de este cliente"
                            >
                              <Coins className="w-4 h-4 text-emerald-200" />
                              <span>Liquidar Deuda ({formatCOP(loan.remainingBalance)})</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {/* Botón 3: Abono / Otro Monto */}
                            <button
                              type="button"
                              onClick={() => openPartialPaymentModal(loan)}
                              className="min-h-[44px] py-2.5 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Coins className="w-4 h-4 text-indigo-400" />
                              <span>Otro Monto / Abono</span>
                            </button>

                            {/* Botón 4: No Pagó */}
                            <button
                              type="button"
                              onClick={() => openIncidentModal(loan)}
                              className="min-h-[44px] py-2.5 px-3 bg-slate-800 hover:bg-rose-950/50 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <XCircle className="w-4 h-4 text-rose-400" />
                              <span>No Pagó</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Acciones de contacto directo */}
                      <div className="flex items-center gap-2 pt-1 text-xs">
                        <button
                          type="button"
                          onClick={() => handleSendMorningReminder(loan)}
                          className="flex-1 min-h-[40px] py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>WhatsApp</span>
                        </button>

                        {client?.phone && (
                          <a
                            href={`tel:${client.phone}`}
                            className="min-h-[40px] px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
                          >
                            <PhoneCall className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Llamar</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredLoans.length === 0 && (
                <div className="text-center py-10 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
                  <Search className="w-8 h-8 text-slate-500 mx-auto" />
                  <h4 className="text-sm font-bold text-white">
                    {searchTerm
                      ? `Sin resultados para "${searchTerm}"`
                      : 'No hay clientes en este filtro'}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {searchTerm
                      ? 'Verifica el nombre o número de teléfono buscado o limpia el filtro.'
                      : 'Puedes registrar un nuevo cliente en esta ruta haciendo clic en el botón inferior.'}
                  </p>
                  {searchTerm ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Limpiar Búsqueda
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setQuickRegisterModalOpen(true)}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl inline-flex items-center gap-2 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>+ Registrar Cliente en Ruta</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTRO DE NOVEDAD (NO PAGÓ HOY) */}
      {incidentModalOpen && selectedLoan && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Registrar Novedad de Cobro</h3>
                  <p className="text-xs text-slate-400">{selectedLoan.clientName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIncidentModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmIncident} className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="text-slate-300 font-semibold block">Motivo del impago:</label>
                {[
                  {
                    id: 'sin_liquidez',
                    label: 'Sin liquidez hoy · Pidió prórroga para mañana',
                    icon: Coins,
                  },
                  { id: 'local_cerrado', label: 'Local comercial o puesto cerrado', icon: Store },
                  {
                    id: 'cliente_ausente',
                    label: 'Cliente ausente en el momento de visita',
                    icon: UserX,
                  },
                  {
                    id: 'promesa_nequi',
                    label: 'Prometió transferencia Nequi/Daviplata más tarde',
                    icon: Smartphone,
                  },
                  {
                    id: 'rehuso_pago',
                    label: 'Rehusó pagar o presentó inconformidad',
                    icon: AlertCircle,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setIncidentReason(item.id as NonPaymentIncident['reason'])}
                      className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                        incidentReason === item.id
                          ? 'bg-rose-950/50 border-rose-500 text-white font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Observación adicional (Opcional):
                </label>
                <textarea
                  value={incidentNotes}
                  onChange={(e) => setIncidentNotes(e.target.value)}
                  placeholder="Ej: Pasar nuevamente a las 5:00 PM..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIncidentModalOpen(false)}
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
                >
                  Guardar Novedad
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ABONO PARCIAL O PAGO PERSONALIZADO CON VALIDACIÓN DE SALDO */}
      {paymentModalOpen && selectedLoan && (
        <PartialPaymentModal
          loan={selectedLoan}
          client={clients.find((c) => c.id === selectedLoan.clientId)}
          onClose={() => setPaymentModalOpen(false)}
          onConfirmPayment={(loanId, amount, distribution, notes, extensionDays, pMethod) => {
            const cleanAmount = roundCOP(amount);
            const client = clients.find((c) => c.id === selectedLoan.clientId);
            const methodKey = pMethod === 'nequi' || pMethod === 'daviplata' ? pMethod : pMethod === 'bancolombia' || pMethod === 'transferencia' ? 'nequi' : 'efectivo';
            onRegisterPayment(loanId, cleanAmount, methodKey, notes);

            if (incidents[loanId]) {
              const nextIncidents = { ...incidents };
              delete nextIncidents[loanId];
              setIncidents(nextIncidents);
            }

            if (client) {
              const entry: LedgerEntry = {
                id: `led-${Date.now()}`,
                receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
                loanId,
                clientId: client.id,
                clientName: client.name,
                routeId: selectedLoan.routeId,
                amount: cleanAmount,
                principalPortion: roundCOP(distribution.principalPortionCovered),
                interestPortion: roundCOP(distribution.interestPortionCovered),
                paymentMethod: methodKey,
                preBalance: roundCOP(distribution.preBalance),
                postBalance: roundCOP(distribution.postBalance),
                timestamp: new Date().toISOString(),
                gpsLocation: '6.2518 N, -75.6142 W',
                hash:
                  Math.random().toString(36).substring(2) +
                  Math.random().toString(36).substring(2),
              };
              setActiveReceipt({ entry, client, loan: selectedLoan });
              if (client.phone) {
                sendAutomaticWhatsAppReceipt({
                  phone: client.phone,
                  amount: cleanAmount,
                  remainingBalance: roundCOP(distribution.postBalance),
                  clientName: client.name,
                  receiptNumber: entry.receiptNumber,
                }).catch((err) => console.warn('Automatic WhatsApp receipt error:', err));
              }
            }

            setPaymentModalOpen(false);
          }}
        />
      )}

      {/* MODAL 3: REGISTRO DE GASTO OPERATIVO DE RUTA */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Fuel className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white text-sm">Registrar Gasto de Ruta (OpEx)</h3>
              </div>
              <button
                type="button"
                onClick={() => setExpenseModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitExpense} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Categoría del Gasto
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) =>
                    setExpenseCategory(e.target.value as RouteExpenseItem['category'])
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white"
                >
                  <option value="combustible_moto">Combustible Moto (Gasolina)</option>
                  <option value="mantenimiento_moto">Mantenimiento Moto (Pinchazo / Aceite)</option>
                  <option value="alimentacion_viaticos">Alimentación / Viático Diario</option>
                  <option value="telefonia_datos">Plan de Datos Móviles</option>
                  <option value="peajes_parqueaderos">Parqueadero / Peaje</option>
                  <option value="contingencia_territorial">Contingencia Territorial</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Monto en Efectivo (COP Enteros)
                </label>
                <input
                  type="number"
                  min={1000}
                  step={500}
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(roundCOP(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono tabular-nums font-bold text-base"
                  required
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Descripción o Comprobante
                </label>
                <input
                  type="text"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder="Ej: Tanqueada estación San Javier..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer"
                >
                  Guardar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ARQUEO DE CAJA FORMAL */}
      {reconciliationModalOpen && (
        <DailyCashReconciliationModal
          route={currentRoute}
          expenses={expenses}
          ledger={ledger}
          onConfirmReconciliation={onConfirmReconciliation}
          onClose={() => setReconciliationModalOpen(false)}
        />
      )}

      {/* MODAL 5: RECIBO DIGITAL WHATSAPP */}
      {activeReceipt && (
        <DigitalReceiptModal
          entry={activeReceipt.entry}
          client={activeReceipt.client}
          loan={activeReceipt.loan}
          onClose={() => setActiveReceipt(null)}
        />
      )}

      {/* MODAL 6: REGISTRO RÁPIDO DE NUEVO DEUDOR O PRÉSTAMO EN RUTA */}
      {quickRegisterModalOpen && (
        <QuickClientRouteRegistrationModal
          currentRoute={currentRoute}
          routeClients={routeClients}
          onClose={() => setQuickRegisterModalOpen(false)}
          onClientRegistered={(newClient, newLoan) => {
            if (onRegisterNewClient) {
              onRegisterNewClient(newClient, newLoan);
            }
          }}
          onLoanCreatedForExistingClient={(newLoan) => {
            if (onCreateLoanForExistingClient) {
              onCreateLoanForExistingClient(newLoan);
            }
          }}
        />
      )}
    </div>
  );
};

