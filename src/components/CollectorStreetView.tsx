import React, { useState } from 'react';
import { 
  Navigation, 
  Wallet, 
  Receipt, 
  MapPin, 
  CheckCircle2, 
  PlusCircle, 
  Fuel, 
  Smartphone, 
  Clock, 
  Search,
  Wifi,
  WifiOff,
  ShieldCheck,
  AlertCircle,
  Send,
  RefreshCw,
  Lock,
  MessageCircle,
  SlidersHorizontal,
  XCircle,
  HelpCircle,
  Coins,
  ChevronRight,
  UserX,
  Store,
  PhoneCall
} from 'lucide-react';
import { 
  RouteData, 
  ClientProfile, 
  LoanDetail, 
  RouteExpenseItem, 
  LedgerEntry 
} from '../data/mockData';
import { formatCOP } from '../utils/financialCalculations';
import { buildMorningPaymentReminder, buildDigitalReceiptWhatsAppMessage } from '../utils/whatsappMessaging';
import { useOnlineStatus, enqueueOfflinePayment, getOfflineQueue, clearOfflineQueue, OfflineQueueItem } from '../utils/offlineSync';
import { DigitalReceiptModal } from './DigitalReceiptModal';
import { DailyCashReconciliationModal } from './DailyCashReconciliationModal';
import { PartialPaymentModal } from './PartialPaymentModal';
import { OfflineNoticeBanner } from './OfflineNoticeBanner';

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
  onRegisterPayment: (loanId: string, amount: number, method: 'efectivo' | 'nequi' | 'daviplata', notes: string) => void;
  onRegisterExpense: (category: RouteExpenseItem['category'], amount: number, description: string) => void;
  onConfirmReconciliation: (routeId: string, actualCash: number, discrepancy: number, notes: string) => void;
}

export const CollectorStreetView: React.FC<CollectorStreetViewProps> = ({
  currentRoute,
  clients,
  loans,
  expenses,
  ledger,
  onRegisterPayment,
  onRegisterExpense,
  onConfirmReconciliation
}) => {
  const isOnline = useOnlineStatus();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'collected' | 'incidents'>('all');
  
  // Modales
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [reconciliationModalOpen, setReconciliationModalOpen] = useState(false);
  
  const [selectedLoan, setSelectedLoan] = useState<LoanDetail | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<{ entry: LedgerEntry; client: ClientProfile; loan: LoanDetail } | null>(null);

  // Registro de novedades (No Pagó) en memoria de la sesión
  const [incidents, setIncidents] = useState<Record<string, NonPaymentIncident>>({});

  // Cola offline local
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>(getOfflineQueue());
  const [isSyncing, setIsSyncing] = useState(false);

  // Payment form states
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'nequi' | 'daviplata'>('efectivo');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Incident form states
  const [incidentReason, setIncidentReason] = useState<NonPaymentIncident['reason']>('sin_liquidez');
  const [incidentNotes, setIncidentNotes] = useState('');

  // Expense form states
  const [expenseCategory, setExpenseCategory] = useState<RouteExpenseItem['category']>('combustible_moto');
  const [expenseAmount, setExpenseAmount] = useState<number>(20000);
  const [expenseDescription, setExpenseDescription] = useState('');

  // 1. FILTRADO ESTRICTO POR RUTA ASIGNADA (AISLAMIENTO DE RUTA)
  const routeLoans = loans.filter(l => l.routeId === currentRoute.id);
  
  const filteredLoans = routeLoans.filter(l => {
    const matchesSearch = 
      l.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.tradeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.code.toLowerCase().includes(searchTerm.toLowerCase());
    
    const hasIncident = Boolean(incidents[l.id]);

    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'collected' && l.todayPaid) ||
      (statusFilter === 'pending' && !l.todayPaid && !hasIncident) ||
      (statusFilter === 'incidents' && hasIncident);

    return matchesSearch && matchesStatus;
  });

  // Gastos de esta ruta hoy
  const routeExpensesToday = expenses.filter(e => e.routeId === currentRoute.id);
  const totalRouteExpenses = routeExpensesToday.reduce((acc, e) => acc + e.amount, 0);

  // Recaudo en efectivo en mano
  const cashCollectedToday = currentRoute.dailyGrossCollected;
  const newDisbursementsToday = 0;

  // ARQUEO EN TIEMPO REAL: Efectivo Físico en Bolsillo
  const cashInHand = currentRoute.baseFloatingCapital + cashCollectedToday - newDisbursementsToday - totalRouteExpenses;

  // ACCIÓN 1: MARCAR PAGADO DIRECTO (CUOTA COMPLETA CON 1-TOQUE)
  const handleQuickPayFull = (loan: LoanDetail) => {
    const client = clients.find(c => c.id === loan.clientId);
    const amount = loan.installmentAmount;
    
    // Registrar el pago
    onRegisterPayment(loan.id, amount, 'efectivo', 'Pago cuota completa en efectivo (1-Toque en calle)');

    // Remover incidente si existía
    if (incidents[loan.id]) {
      const nextIncidents = { ...incidents };
      delete nextIncidents[loan.id];
      setIncidents(nextIncidents);
    }

    // Si está offline, encolar en localStorage
    if (!isOnline && client) {
      const offlineItem: OfflineQueueItem = {
        id: `offline-${Date.now()}`,
        loanId: loan.id,
        clientId: client.id,
        clientName: client.name,
        amount,
        paymentMethod: 'efectivo',
        notes: 'Pago en calle offline',
        timestamp: new Date().toISOString(),
        gpsLocation: `${client.lat} N, ${client.lng} W`,
        isSynced: false
      };
      enqueueOfflinePayment(offlineItem);
      setOfflineQueue(getOfflineQueue());
    }

    // Generar recibo listo para WhatsApp
    if (client) {
      const entry: LedgerEntry = {
        id: `led-${Date.now()}`,
        receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
        loanId: loan.id,
        clientId: client.id,
        clientName: client.name,
        routeId: loan.routeId,
        amount,
        principalPortion: amount * 0.8,
        interestPortion: amount * 0.2,
        paymentMethod: 'efectivo',
        preBalance: loan.remainingBalance,
        postBalance: Math.max(0, loan.remainingBalance - amount),
        timestamp: new Date().toISOString(),
        gpsLocation: '6.2518 N, -75.6142 W',
        hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
      };
      setActiveReceipt({ entry, client, loan });
    }
  };

  // ACCIÓN 2: ABRIR MODAL DE ABONO PARCIAL
  const openPartialPaymentModal = (loan: LoanDetail) => {
    setSelectedLoan(loan);
    setPaymentAmount(Math.round(loan.installmentAmount / 2));
    setPaymentNotes('Abono parcial de cuota');
    setPaymentModalOpen(true);
  };

  // ACCIÓN 3: ABRIR MODAL DE REGISTRAR NOVEDAD (NO PAGÓ)
  const openIncidentModal = (loan: LoanDetail) => {
    setSelectedLoan(loan);
    setIncidentReason('sin_liquidez');
    setIncidentNotes('');
    setIncidentModalOpen(true);
  };

  // CONFIRMAR NOVEDAD (NO PAGÓ)
  const handleConfirmIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    const newIncident: NonPaymentIncident = {
      loanId: selectedLoan.id,
      reason: incidentReason,
      notes: incidentNotes,
      timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    };

    setIncidents(prev => ({ ...prev, [selectedLoan.id]: newIncident }));
    setIncidentModalOpen(false);
  };

  // SUBMIT DEL PAGO PERSONALIZADO
  const submitCustomPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan || paymentAmount <= 0) return;

    const client = clients.find(c => c.id === selectedLoan.clientId);
    onRegisterPayment(selectedLoan.id, paymentAmount, paymentMethod, paymentNotes);

    if (incidents[selectedLoan.id]) {
      const nextIncidents = { ...incidents };
      delete nextIncidents[selectedLoan.id];
      setIncidents(nextIncidents);
    }

    if (client) {
      const entry: LedgerEntry = {
        id: `led-${Date.now()}`,
        receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
        loanId: selectedLoan.id,
        clientId: client.id,
        clientName: client.name,
        routeId: selectedLoan.routeId,
        amount: paymentAmount,
        principalPortion: paymentAmount * 0.8,
        interestPortion: paymentAmount * 0.2,
        paymentMethod,
        preBalance: selectedLoan.remainingBalance,
        postBalance: Math.max(0, selectedLoan.remainingBalance - paymentAmount),
        timestamp: new Date().toISOString(),
        gpsLocation: '6.2518 N, -75.6142 W',
        hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
      };
      setActiveReceipt({ entry, client, loan: selectedLoan });
    }

    setPaymentModalOpen(false);
  };

  // SUBMIT DEL GASTO OPERATIVO
  const submitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseAmount <= 0) return;
    onRegisterExpense(expenseCategory, expenseAmount, expenseDescription || 'Gasto operacional registrado en calle');
    setExpenseModalOpen(false);
    setExpenseAmount(20000);
    setExpenseDescription('');
  };

  // SINCRONIZAR COLA OFFLINE
  const handleSyncOfflineQueue = async () => {
    setIsSyncing(true);
    await new Promise(r => setTimeout(r, 1200));
    clearOfflineQueue();
    setOfflineQueue([]);
    setIsSyncing(false);
  };

  // Recordatorio matutino de WhatsApp
  const handleSendMorningReminder = (loan: LoanDetail) => {
    const client = clients.find(c => c.id === loan.clientId);
    if (!client) return;
    const reminder = buildMorningPaymentReminder(client, loan);
    window.open(reminder.whatsappUrl, '_blank');
  };

  const getIncidentLabel = (reason: NonPaymentIncident['reason']) => {
    switch (reason) {
      case 'sin_liquidez':
        return 'Sin plata hoy · Pidió prórroga';
      case 'local_cerrado':
        return 'Local / Puesto cerrado';
      case 'cliente_ausente':
        return 'Cliente no se encontraba';
      case 'promesa_nequi':
        return 'Prometió pagar por Nequi tarde';
      case 'rehuso_pago':
        return 'Rehusó pagar / Conflicto';
      default:
        return 'Novedad registrada';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 pb-20">
      {/* BANNER VISUAL DE CONEXIÓN Y COLA OFFLINE EN CALLE */}
      <OfflineNoticeBanner onSyncComplete={(count) => setOfflineQueue([])} />

      {/* DISPOSICIÓN RESPONSIVA: 1 COLUMNA EN MÓVIL, 2 COLUMNAS EN TABLETA/COMPUTADORA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 items-start">
        {/* COLUMNA IZQUIERDA: ARQUEO DE BOLSILLO EN CALLE & GASTOS */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="text-xs font-black text-white tracking-wide uppercase">
                    {currentRoute.name}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Rutero: <strong className="text-emerald-300">{currentRoute.collectorName}</strong> ({currentRoute.code})
                </p>
              </div>

              <div>
                {isOnline ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Wifi className="w-3 h-3" />
                    En Línea
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <WifiOff className="w-3 h-3" />
                    Offline
                  </span>
                )}
              </div>
            </div>

            {/* EFECTIVO FÍSICO EN MANO (BOLSILLO) */}
            <div className="bg-gradient-to-r from-emerald-950/80 to-slate-950 border-2 border-emerald-500/40 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold block">
                    Efectivo Físico en Bolsillo
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                    {formatCOP(cashInHand)}
                  </span>
                </div>
              </div>
            </div>

            {/* DESGLOSE RÁPIDO: BASE, COBRADO, GASTOS */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Base Inicial</span>
                <span className="text-xs sm:text-sm font-bold text-slate-200 font-mono mt-0.5 block">
                  {formatCOP(currentRoute.baseFloatingCapital)}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Cobrado Hoy</span>
                <span className="text-xs sm:text-sm font-bold text-emerald-400 font-mono mt-0.5 block">
                  +{formatCOP(cashCollectedToday)}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Gastos Moto/Viático</span>
                <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono mt-0.5 block">
                  -{formatCOP(totalRouteExpenses)}
                </span>
              </div>
            </div>

            {/* BOTONES DE OPERACIÓN LOGÍSTICA DE CALLE */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setExpenseModalOpen(true)}
                className="flex-1 py-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
              >
                <Fuel className="w-4 h-4" />
                + Registrar Gasto Moto
              </button>
              <button
                onClick={() => setReconciliationModalOpen(true)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950 flex items-center justify-center gap-1.5 transition-all"
              >
                <Lock className="w-4 h-4" />
                Arqueo de Turno
              </button>
            </div>

            {/* BARRA DE AVANCE DE PARADAS */}
            <div className="space-y-1.5 text-xs pt-2 border-t border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Progreso del Recorrido:</span>
                <span className="font-bold font-mono text-emerald-400">
                  {routeLoans.filter(l => l.todayPaid).length} de {routeLoans.length} pagados
                </span>
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${(routeLoans.filter(l => l.todayPaid).length / Math.max(1, routeLoans.length)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: LISTADO DE PARADAS POR ORDEN DE VISITA TERRITORIAL */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* BUSCADOR RÁPIDO */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                placeholder="Buscar cliente, comercio o dirección..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>

            {/* FILTROS POR ESTADO DE COBRO */}
            <div className="flex bg-slate-900 border-2 border-slate-800 rounded-2xl p-1 text-xs overflow-x-auto">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                  statusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos ({routeLoans.length})
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                  statusFilter === 'pending' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pendientes ({routeLoans.filter(l => !l.todayPaid && !incidents[l.id]).length})
              </button>
              <button
                onClick={() => setStatusFilter('collected')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                  statusFilter === 'collected' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pagados ({routeLoans.filter(l => l.todayPaid).length})
              </button>
              <button
                onClick={() => setStatusFilter('incidents')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                  statusFilter === 'incidents' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                No Pagó ({Object.keys(incidents).length})
              </button>
            </div>
          </div>

          {/* LISTADO DE PARADAS CON ORDEN DE VISITA Y BOTONES GRANDES */}
          <div className="space-y-3">
            {filteredLoans.map((loan, index) => {
              const client = clients.find(c => c.id === loan.clientId);
              const incident = incidents[loan.id];
              const visitNumber = index + 1;

              return (
                <div
                  key={loan.id}
                  className={`border-2 rounded-3xl p-4 sm:p-5 transition-all shadow-md ${
                    loan.todayPaid
                      ? 'bg-slate-900/60 border-emerald-500/40 opacity-95'
                      : incident
                      ? 'bg-rose-950/20 border-rose-500/40'
                      : loan.daysOverdue >= 2
                      ? 'bg-amber-950/20 border-amber-500/50'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* ENCABEZADO DE LA PARADA CON ORDEN DE VISITA */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* INSIGNIA DE PARADA EN RUTA */}
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-slate-800 text-white font-mono border border-slate-700">
                          #{visitNumber} Parada
                        </span>
                        
                        <span className="font-bold text-white text-base">
                          {loan.clientName}
                        </span>

                        {loan.todayPaid && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Cobrado Hoy
                          </span>
                        )}

                        {incident && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> {getIncidentLabel(incident.reason)}
                          </span>
                        )}

                        {!loan.todayPaid && !incident && loan.daysOverdue >= 2 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">
                            <AlertCircle className="w-3 h-3" /> Mora {loan.daysOverdue}d
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-slate-400" />
                        <span>{loan.tradeName}</span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{client?.address || 'Sector de Calle'}</span>
                        <span className="text-slate-500">· {client?.neighborhood}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 bg-slate-950/80 p-2.5 rounded-2xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Cuota Diaria</span>
                      <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono">
                        {formatCOP(loan.installmentAmount)}
                      </span>
                    </div>
                  </div>

                  {/* DATOS DE AMORTIZACIÓN Y FIADOR */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Saldo Restante</span>
                      <span className="font-bold text-slate-200 font-mono">
                        {formatCOP(loan.remainingBalance)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Cuotas Pagadas</span>
                      <span className="font-bold text-slate-300 font-mono">
                        {loan.installmentsPaid} de {loan.termDays}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px]">Fiador Solidario</span>
                      <span className="text-slate-300 truncate block">
                        {client?.guarantorName ? client.guarantorName.split(' ')[0] : 'Verificado'}
                      </span>
                    </div>
                  </div>

                  {/* NOTA SI HAY INCIDENTE REGISTRADO HOY */}
                  {incident && (
                    <div className="mt-2.5 p-2 rounded-xl bg-rose-950/40 border border-rose-500/30 text-[11px] text-rose-200 flex items-center justify-between">
                      <span><strong>Novedad ({incident.timestamp}):</strong> {incident.notes || getIncidentLabel(incident.reason)}</span>
                      <button
                        onClick={() => openIncidentModal(loan)}
                        className="text-xs text-rose-300 underline font-bold ml-2"
                      >
                        Cambiar
                      </button>
                    </div>
                  )}

                  {/* BOTONES DE ACCIÓN RÁPIDA DE CALLE (GRANDES Y ERGONÓMICOS) */}
                  <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-2">
                    {loan.todayPaid ? (
                      <div className="flex gap-2">
                        <div className="flex-1 py-3 bg-emerald-950/60 border-2 border-emerald-500/40 text-emerald-300 rounded-2xl text-xs font-black flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Cuota Cobrada con Éxito Hoy
                        </div>
                        <button
                          onClick={() => {
                            if (client) {
                              const entry: LedgerEntry = {
                                id: `led-${Date.now()}`,
                                receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
                                loanId: loan.id,
                                clientId: client.id,
                                clientName: client.name,
                                routeId: loan.routeId,
                                amount: loan.installmentAmount,
                                principalPortion: loan.installmentAmount * 0.8,
                                interestPortion: loan.installmentAmount * 0.2,
                                paymentMethod: 'efectivo',
                                preBalance: loan.remainingBalance + loan.installmentAmount,
                                postBalance: loan.remainingBalance,
                                timestamp: new Date().toISOString(),
                                gpsLocation: '6.2518 N, -75.6142 W',
                                hash: Math.random().toString(36).substring(2)
                              };
                              setActiveReceipt({ entry, client, loan });
                            }
                          }}
                          className="px-3.5 py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-2xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md"
                          title="Volver a abrir o enviar comprobante WhatsApp"
                        >
                          <Receipt className="w-4 h-4" />
                          <span className="hidden sm:inline">Comprobante</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        {/* BOTÓN PRIMARIO 1-TOQUE: MARCAR PAGADO (CUOTA COMPLETA) */}
                        <button
                          onClick={() => handleQuickPayFull(loan)}
                          className="sm:col-span-6 py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-[0.98] text-white rounded-2xl text-xs font-black shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition-all"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Marcar Pagado ({formatCOP(loan.installmentAmount)})</span>
                        </button>

                        {/* BOTÓN 2: ABONO PARCIAL */}
                        <button
                          onClick={() => openPartialPaymentModal(loan)}
                          className="sm:col-span-3 py-3.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-2xl text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Coins className="w-4 h-4 text-emerald-400" />
                          <span>Abono Parcial</span>
                        </button>

                        {/* BOTÓN 3: NO PAGÓ (REGISTRAR NOVEDAD) */}
                        <button
                          onClick={() => openIncidentModal(loan)}
                          className="sm:col-span-3 py-3.5 px-3 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 rounded-2xl text-xs font-bold border border-rose-500/30 flex items-center justify-center gap-1.5 transition-all"
                        >
                          <XCircle className="w-4 h-4 text-rose-400" />
                          <span>No Pagó</span>
                        </button>
                      </div>
                    )}

                    {/* BARRA DE COMUNICACIÓN RÁPIDA (WHATSAPP + LLAMADA) */}
                    <div className="flex items-center gap-2 pt-1 text-xs">
                      <button
                        onClick={() => handleSendMorningReminder(loan)}
                        className="flex-1 py-2 bg-emerald-950/30 hover:bg-emerald-950/50 text-emerald-300 border border-emerald-500/20 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Enviar Recordatorio WhatsApp</span>
                      </button>

                      {client?.phone && (
                        <a
                          href={`tel:${client.phone}`}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold flex items-center gap-1 transition-colors"
                        >
                          <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
                          <span className="hidden sm:inline">Llamar</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredLoans.length === 0 && (
              <div className="text-center py-12 bg-slate-900/50 border border-slate-800 rounded-3xl p-6 space-y-2">
                <Store className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-sm font-bold text-white">No hay créditos en este filtro.</p>
                <p className="text-xs text-slate-400">Verifica los criterios de búsqueda o cambia la pestaña de estado.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL 1: REGISTRO DE NOVEDAD (NO PAGÓ HOY) */}
      {incidentModalOpen && selectedLoan && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-500/40 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Registrar Novedad: No Pagó Hoy</h3>
                  <p className="text-xs text-slate-400">{selectedLoan.clientName}</p>
                </div>
              </div>
              <button 
                onClick={() => setIncidentModalOpen(false)}
                className="text-slate-400 hover:text-white text-base p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmIncident} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-2">
                  Selecciona el motivo del impago:
                </label>
                <div className="space-y-2">
                  {[
                    { id: 'sin_liquidez', label: 'Sin dinero hoy · Pidió prórroga para mañana', icon: Coins },
                    { id: 'local_cerrado', label: 'Local comercial o puesto cerrado', icon: Store },
                    { id: 'cliente_ausente', label: 'Cliente ausente · No se encontraba en el sitio', icon: UserX },
                    { id: 'promesa_nequi', label: 'Prometió pagar vía Nequi/Daviplata más tarde', icon: Smartphone },
                    { id: 'rehuso_pago', label: 'Rehusó pagar o presentó conflicto', icon: AlertCircle },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setIncidentReason(item.id as NonPaymentIncident['reason'])}
                        className={`w-full p-3 rounded-xl border-2 text-left flex items-center gap-3 transition-all ${
                          incidentReason === item.id
                            ? 'bg-rose-950/50 border-rose-500 text-white font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <Icon className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="text-xs">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">
                  Nota / Compromiso adicional (Opcional):
                </label>
                <textarea
                  value={incidentNotes}
                  onChange={(e) => setIncidentNotes(e.target.value)}
                  placeholder="Ej: Dijo que pasa a las 5pm o paga doble mañana..."
                  rows={2}
                  className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIncidentModalOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg shadow-rose-950"
                >
                  Confirmar Novedad
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ABONO PARCIAL O PERSONALIZADO */}
      {/* MODAL 2: ABONO PARCIAL O PRÓRROGA CON MOTOR FINANCIERO */}
      {paymentModalOpen && selectedLoan && (
        <PartialPaymentModal
          loan={selectedLoan}
          client={clients.find(c => c.id === selectedLoan.clientId)}
          onClose={() => setPaymentModalOpen(false)}
          onConfirmPayment={(loanId, amount, distribution, notes, extensionDays) => {
            const client = clients.find(c => c.id === selectedLoan.clientId);
            onRegisterPayment(loanId, amount, 'efectivo', notes);

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
                amount,
                principalPortion: distribution.principalPortionCovered,
                interestPortion: distribution.interestPortionCovered,
                paymentMethod: 'efectivo',
                preBalance: distribution.preBalance,
                postBalance: distribution.postBalance,
                timestamp: new Date().toISOString(),
                gpsLocation: '6.2518 N, -75.6142 W',
                hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
              };
              setActiveReceipt({ entry, client, loan: selectedLoan });
            }

            setPaymentModalOpen(false);
          }}
        />
      )}

      {/* MODAL 3: REGISTRO DE GASTO DE CALLE (GASOLINA / VIÁTICO) */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Fuel className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white text-base">Registrar Gasto de Ruta (OpEx)</h3>
              </div>
              <button 
                onClick={() => setExpenseModalOpen(false)}
                className="text-slate-400 hover:text-white text-base p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitExpense} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1">
                  Categoría del Gasto
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value as RouteExpenseItem['category'])}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white"
                >
                  <option value="combustible_moto">Combustible Moto (Gasolina)</option>
                  <option value="mantenimiento_moto">Mantenimiento Moto (Pinchazo / Aceite)</option>
                  <option value="alimentacion_viaticos">Alimentación / Viático Diario</option>
                  <option value="telefonia_datos">Plan de Datos Móviles (Claro/Tigo)</option>
                  <option value="peajes_parqueaderos">Parqueadero / Peaje Urbano</option>
                  <option value="contingencia_territorial">Contingencia Territorial</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">
                  Monto Pagado en Efectivo (COP)
                </label>
                <input
                  type="number"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono font-bold text-base"
                  required
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">
                  Descripción o Establecimiento
                </label>
                <input
                  type="text"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder="Ej: Tanqueada Terpel San Javier..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs shadow-lg shadow-amber-950"
                >
                  Guardar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ARQUEO DE CAJA */}
      {reconciliationModalOpen && (
        <DailyCashReconciliationModal
          route={currentRoute}
          expenses={expenses}
          onConfirmReconciliation={onConfirmReconciliation}
          onClose={() => setReconciliationModalOpen(false)}
        />
      )}

      {/* MODAL 5: RECIBO DIGITAL WHATSAPP LISTO PARA ENVIAR TRAS EL PAGO */}
      {activeReceipt && (
        <DigitalReceiptModal
          entry={activeReceipt.entry}
          client={activeReceipt.client}
          loan={activeReceipt.loan}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  );
};
