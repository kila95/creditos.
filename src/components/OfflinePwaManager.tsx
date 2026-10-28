import React, { useState, useEffect, useCallback } from 'react';
import {
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  CheckCircle2,
  Clock,
  ShieldCheck,
  PlusCircle,
  Trash2,
  HardDrive,
  CloudUpload,
} from 'lucide-react';
import {
  IndexedDBPaymentRecord,
  saveOfflinePaymentToIndexedDB,
  getAllIndexedDBPayments,
  syncIndexedDBPaymentsToSupabase,
  clearSyncedIndexedDBPayments,
  registerOfflineServiceWorker,
} from '../utils/indexedDbOfflineQueue';
import { ClientProfile, LoanDetail } from '../data/mockData';

export interface OfflinePwaManagerProps {
  tenantId?: string;
  routeId?: string;
  clients?: ClientProfile[];
  loans?: LoanDetail[];
  onPaymentSyncedToApp?: (record: IndexedDBPaymentRecord) => void;
}

export const OfflinePwaManager: React.FC<OfflinePwaManagerProps> = ({
  tenantId = 'org-medellin-01',
  routeId = 'route-1',
  clients = [],
  loans = [],
  onPaymentSyncedToApp,
}) => {
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  // Permite simular pérdida de señal en ruta para probar el guardado en IndexedDB y la auto-sincronización al reconectar
  const [simulateOfflineMode, setSimulateOfflineMode] = useState<boolean>(false);
  const [swRegistered, setSwRegistered] = useState<boolean>(false);
  const [records, setRecords] = useState<IndexedDBPaymentRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Formulario para registrar un abono en IndexedDB
  const [selectedClientName, setSelectedClientName] = useState<string>(
    clients[0]?.name || 'Marta Lucía Gómez (Tienda La 70)'
  );
  const [amount, setAmount] = useState<number>(35000);
  const [paymentMethod, setPaymentMethod] = useState<
    'efectivo' | 'nequi' | 'bancolombia' | 'daviplata'
  >('efectivo');
  const [notes, setNotes] = useState<string>('Abono capturado en zona sin cobertura');

  const isEffectiveOnline = browserOnline && !simulateOfflineMode;

  const loadIndexedDBQueue = useCallback(async () => {
    const all = await getAllIndexedDBPayments();
    setRecords(all);
  }, []);

  // 1. Registrar Service Worker y cargar cola de IndexedDB al montar
  useEffect(() => {
    registerOfflineServiceWorker().then((reg) => {
      setSwRegistered(Boolean(reg));
    });
    loadIndexedDBQueue();
  }, [loadIndexedDBQueue]);

  // 2. Sincronización automática hacia Supabase al detectar conexión
  const handleSyncToSupabase = useCallback(async () => {
    if (!isEffectiveOnline || isSyncing) return;
    setIsSyncing(true);

    try {
      const result = await syncIndexedDBPaymentsToSupabase();
      await loadIndexedDBQueue();
      if (result.syncedCount > 0) {
        setStatusToast(
          `Sincronización automática completada: ${result.syncedCount} ${
            result.syncedCount === 1 ? 'abono subido' : 'abonos subidos'
          } de IndexedDB a Supabase.`
        );
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isEffectiveOnline, isSyncing, loadIndexedDBQueue]);

  // Escuchar eventos nativos online/offline y mensajes del Service Worker
  useEffect(() => {
    const onOnline = () => {
      setBrowserOnline(true);
    };
    const onOffline = () => {
      setBrowserOnline(false);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_SYNC_INDEXEDDB_NOW') {
        handleSyncToSupabase();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
    };
  }, [handleSyncToSupabase]);

  // Disparar auto-sync cada vez que el estado efectivo pasa a ONLINE y hay cobros pendientes en IndexedDB
  useEffect(() => {
    const pendingCount = records.filter((r) => r.status !== 'synced').length;
    if (isEffectiveOnline && pendingCount > 0) {
      handleSyncToSupabase();
    }
  }, [isEffectiveOnline, records, handleSyncToSupabase]);

  // Guardar un nuevo cobro en IndexedDB
  const handleSaveOfflinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusToast(null);

    const matchedClient = clients.find((c) => c.name === selectedClientName);
    const matchedLoan = loans.find(
      (l) => l.clientName === selectedClientName || l.clientId === matchedClient?.id
    );

    const saved = await saveOfflinePaymentToIndexedDB({
      tenantId,
      routeId,
      loanId: matchedLoan?.id || 'loan-offline-01',
      clientId: matchedClient?.id || 'cli-offline-01',
      clientName: selectedClientName,
      amount,
      paymentMethod,
      notes,
    });

    await loadIndexedDBQueue();
    onPaymentSyncedToApp?.(saved);

    if (!isEffectiveOnline) {
      setStatusToast(
        `Sin señal: Abono de $${amount.toLocaleString(
          'es-CO'
        )} guardado de forma segura en IndexedDB (${saved.clientTxUuid}). Se sincronizará automáticamente al recuperar red.`
      );
    } else {
      setStatusToast(
        `Abono registrado en IndexedDB y sincronizado automáticamente con Supabase (${saved.clientTxUuid}).`
      );
    }
  };

  const handleClearSynced = async () => {
    await clearSyncedIndexedDBPayments();
    await loadIndexedDBQueue();
    setStatusToast('Registros ya sincronizados limpiados de IndexedDB.');
  };

  const pendingCount = records.filter((r) => r.status !== 'synced').length;
  const syncedCount = records.filter((r) => r.status === 'synced').length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Cabecera de Estado PWA + Service Worker + IndexedDB */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0 ${
              isEffectiveOnline
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-amber-500/20 border-amber-400/50 text-amber-300'
            }`}
          >
            {isEffectiveOnline ? (
              <Wifi className="w-6 h-6" />
            ) : (
              <WifiOff className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                Módulo 2 · Modo Offline PWA (Service Worker + IndexedDB)
              </h2>
              <span
                className={`text-[11px] font-mono px-2.5 py-0.5 rounded-md border font-bold ${
                  isEffectiveOnline
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                }`}
              >
                {isEffectiveOnline ? 'ONLINE · AUTO-SYNC ACTIVO' : 'OFFLINE · GUARDANDO EN INDEXEDDB'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Base de datos local <code className="text-emerald-400 font-mono">enruta_offline_pwa_db</code> y Service Worker <code className="text-emerald-400 font-mono">/sw.js</code> ({swRegistered ? 'Activo' : 'Listo'}).
            </p>
          </div>
        </div>

        {/* Conmutador para Simular Pérdida de Señal en Calle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSimulateOfflineMode(!simulateOfflineMode)}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 border transition-all cursor-pointer ${
              simulateOfflineMode
                ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {simulateOfflineMode ? (
              <>
                <Wifi className="w-4 h-4" />
                <span>Restaurar Señal (Auto-Sync)</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-amber-400" />
                <span>Simular Pérdida de Señal</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Métricas de IndexedDB */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400">Cobros Pendientes en IndexedDB</span>
            <p className="text-2xl font-black text-amber-400 font-mono tabular-nums mt-1">
              {pendingCount}
            </p>
          </div>
          <HardDrive className="w-8 h-8 text-amber-400/60" />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400">Sincronizados hacia Supabase</span>
            <p className="text-2xl font-black text-emerald-400 font-mono tabular-nums mt-1">
              {syncedCount}
            </p>
          </div>
          <CloudUpload className="w-8 h-8 text-emerald-400/60" />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400">Estado del Service Worker</span>
            <p className="text-sm font-bold text-white font-mono mt-1.5">
              {swRegistered ? 'Registrado (/sw.js)' : 'Modo Cliente Activo'}
            </p>
          </div>
          <ShieldCheck className="w-8 h-8 text-indigo-400/60" />
        </div>
      </div>

      {/* Notificación de estado */}
      {statusToast && (
        <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-4 flex items-start gap-3 text-xs sm:text-sm text-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <span>{statusToast}</span>
        </div>
      )}

      {/* Grilla: Captura de Abono Offline vs Tabla IndexedDB */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Formulario para probar cobro Offline en IndexedDB */}
        <form
          onSubmit={handleSaveOfflinePayment}
          className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
        >
          <div className="pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Registrar Abono en Cola IndexedDB</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Prueba cómo se almacenan los cobros sin señal y se suben solos al volver a estar Online.
            </p>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Cliente</label>
            {clients.length > 0 ? (
              <select
                value={selectedClientName}
                onChange={(e) => setSelectedClientName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.tradeName})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedClientName}
                onChange={(e) => setSelectedClientName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Monto del Abono (COP)
              </label>
              <input
                type="number"
                min={1000}
                step={1000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value || 0))}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Medio de Pago</label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as 'efectivo' | 'nequi' | 'bancolombia' | 'daviplata'
                  )
                }
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="efectivo">Efectivo</option>
                <option value="nequi">Nequi</option>
                <option value="bancolombia">Bancolombia</option>
                <option value="daviplata">DaviPlata</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Nota Operativa</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>
              {isEffectiveOnline
                ? 'Guardar en IndexedDB y Sincronizar'
                : 'Guardar Cobro Localmente en IndexedDB (Offline)'}
            </span>
          </button>
        </form>

        {/* Tabla de Registros en IndexedDB */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">
                Cola Local en <code className="text-emerald-400 font-mono">IndexedDB</code> (Store: <code className="font-mono text-slate-300">offline_payments</code>)
              </h3>
              <p className="text-xs text-slate-400">
                Cada abono tiene un UUID de idempotencia único para evitar duplicados al reconectar.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncToSupabase}
                disabled={!isEffectiveOnline || isSyncing || pendingCount === 0}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sincronizar Ahora</span>
              </button>

              {syncedCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearSynced}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Limpiar Sincronizados</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/60">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                  <th className="py-3 px-3.5">Cliente / Token UUID</th>
                  <th className="py-3 px-3.5 text-right">Monto</th>
                  <th className="py-3 px-3.5">Fecha Captura</th>
                  <th className="py-3 px-3.5 text-right">Estado IndexedDB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-slate-400">
                      La cola de IndexedDB está vacía. Activa "Simular Pérdida de Señal" y registra un abono para verlo en cola.
                    </td>
                  </tr>
                ) : (
                  records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-white">{rec.clientName}</div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {rec.clientTxUuid}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-400 tabular-nums whitespace-nowrap">
                        ${rec.amount.toLocaleString('es-CO')}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(rec.createdAt).toLocaleTimeString('es-CO')}
                      </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        {rec.status === 'synced' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Sincronizado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400">
                            <Clock className="w-3.5 h-3.5" />
                            En Cola Local
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfflinePwaManager;
