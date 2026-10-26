import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, AlertTriangle, Database } from 'lucide-react';
import { useOnlineStatus, getOfflineQueue, clearOfflineQueue, syncOfflineQueueWithServer, OfflineQueueItem } from '../utils/offlineSync';

interface OfflineNoticeBannerProps {
  onSyncComplete?: (syncedCount: number) => void;
}

/**
 * COMPONENTE: Banner Visual de Alta Visibilidad para Trabajo en Calle sin Conexión
 * Diseñado para visibilidad bajo luz solar directa en moto o vía pública.
 */
export const OfflineNoticeBanner: React.FC<OfflineNoticeBannerProps> = ({ onSyncComplete }) => {
  const isOnline = useOnlineStatus();
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncSuccessToast, setSyncSuccessToast] = useState<boolean>(false);

  // Monitorear cola local de cobros
  const checkQueue = () => {
    const queue = getOfflineQueue();
    setOfflineCount(queue.length);
  };

  useEffect(() => {
    checkQueue();
    const interval = setInterval(checkQueue, 2500);
    return () => clearInterval(interval);
  }, []);

  // Detectar reconexión automática
  useEffect(() => {
    if (isOnline && offlineCount > 0 && !isSyncing) {
      handleManualSync();
    }
  }, [isOnline]);

  const handleManualSync = async () => {
    if (!isOnline || isSyncing || offlineCount === 0) return;
    setIsSyncing(true);

    try {
      const result = await syncOfflineQueueWithServer();
      const count = result.syncedCount;

      checkQueue();
      if (count > 0) {
        setSyncSuccessToast(true);
        if (onSyncComplete) onSyncComplete(count);
        setTimeout(() => setSyncSuccessToast(false), 4000);
      }
    } catch (err) {
      console.error('Error sincronizando cola offline con Cloud SQL:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Si está online y no hay cobros en cola ni toast, no interrumpe la pantalla
  if (isOnline && offlineCount === 0 && !syncSuccessToast) {
    return null;
  }

  // Notificación de sincronización exitosa
  if (syncSuccessToast) {
    return (
      <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between border-2 border-emerald-400 animate-in fade-in slide-in-from-top duration-300">
        <div className="flex items-center gap-2.5">
          <Wifi className="w-5 h-5 text-emerald-200 shrink-0 animate-bounce" />
          <span className="text-xs sm:text-sm font-black tracking-wide">
            ¡Conexión restaurada! Se sincronizaron los cobros en calle con el servidor.
          </span>
        </div>
      </div>
    );
  }

  // MODO OFFLINE ACTIVO (Alto contraste amarillo/ámbar y rojo para la calle)
  return (
    <div
      role="status"
      aria-live="assertive"
      className={`${
        !isOnline
          ? 'bg-amber-500 text-slate-950 border-2 border-amber-300 shadow-2xl'
          : 'bg-indigo-950 text-indigo-100 border-2 border-indigo-500'
      } rounded-2xl p-3 sm:p-4 transition-all duration-300 animate-in fade-in slide-in-from-top-2`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Indicador de Estado */}
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              !isOnline ? 'bg-slate-950/20 text-slate-950 animate-pulse' : 'bg-indigo-900/60 text-indigo-300'
            }`}
          >
            {!isOnline ? <WifiOff className="w-6 h-6 stroke-[2.5]" /> : <Database className="w-6 h-6 stroke-[2.5]" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-black">
                {!isOnline ? 'MODO CALLE SIN INTERNET' : 'CONEXIÓN RESTAURADA'}
              </span>
              {!isOnline && (
                <span className="bg-slate-950 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Local Seguro
                </span>
              )}
            </div>
            <p className="text-xs font-semibold mt-0.5 opacity-90 leading-snug">
              {!isOnline
                ? 'Puedes seguir cobrando con normalidad. Los recibos se guardan en el celular y se subirán al reconectar.'
                : 'Tienes registros guardados localmente listos para subir a la base de datos.'}
            </p>
          </div>
        </div>

        {/* Contador de Cola y Acción */}
        <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-950/15 sm:border-transparent">
          {offlineCount > 0 && (
            <div
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 ${
                !isOnline ? 'bg-slate-950 text-amber-300' : 'bg-indigo-800 text-indigo-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>{offlineCount} {offlineCount === 1 ? 'cobro en espera' : 'cobros en espera'}</span>
            </div>
          )}

          {isOnline && offlineCount > 0 && (
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors shadow-md disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Subiendo...' : 'Subir Ahora'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
