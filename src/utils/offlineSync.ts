/**
 * MOTOR DE SINCRONIZACIÓN OFFLINE (PWA & LOCAL STORAGE QUEUE CON IDEMPOTENCIA)
 * Garantiza resiliencia en zonas de baja cobertura celular en comunas de Medellín
 */

import { useState, useEffect } from 'react';

const OFFLINE_QUEUE_KEY = 'rutacapital_offline_collection_queue_v2';
const LEGACY_QUEUE_KEY = 'rutacapital_offline_collection_queue';

export interface OfflineQueueItem {
  id: string;
  clientTxUuid: string; // Token de idempotencia único para evitar cobros dobles
  loanId: string;
  clientId: string;
  clientName: string;
  routeId?: string;
  organizationId?: string;
  amount: number;
  paymentMethod: 'efectivo' | 'nequi' | 'daviplata' | 'bancolombia';
  notes: string;
  timestamp: string;
  gpsLocation: string;
  isSynced: boolean;
  retryCount?: number;
  lastError?: string;
}

/**
 * Hook para detectar conectividad en tiempo real en la calle con auto-sincronización
 */
export function useOnlineStatus(onReconnect?: () => void) {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (onReconnect) {
        onReconnect();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onReconnect]);

  return isOnline;
}

/**
 * Guarda un cobro en la cola local si no hay internet con token de idempotencia
 */
export function enqueueOfflinePayment(item: {
  loanId: string;
  clientId: string;
  clientName: string;
  routeId?: string;
  organizationId?: string;
  amount: number;
  paymentMethod: 'efectivo' | 'nequi' | 'daviplata' | 'bancolombia';
  notes: string;
  timestamp: string;
  gpsLocation: string;
  clientTxUuid?: string;
}): OfflineQueueItem {
  const queue = getOfflineQueue();
  const txUuid = item.clientTxUuid || `tx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const newItem: OfflineQueueItem = {
    ...item,
    id: `off-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    clientTxUuid: txUuid,
    isSynced: false,
    retryCount: 0,
  };

  queue.push(newItem);
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Error guardando en cola offline:', e);
  }

  return newItem;
}

/**
 * Obtiene los cobros pendientes en la cola local
 */
export function getOfflineQueue(): OfflineQueueItem[] {
  try {
    // Migrar cola legada si existe
    const legacy = localStorage.getItem(LEGACY_QUEUE_KEY);
    const modern = localStorage.getItem(OFFLINE_QUEUE_KEY);

    let queue: OfflineQueueItem[] = [];
    if (modern) {
      queue = JSON.parse(modern);
    } else if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      queue = parsedLegacy.map((item: any) => ({
        ...item,
        clientTxUuid: `tx-legacy-${item.id}`,
        retryCount: 0,
      }));
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      localStorage.removeItem(LEGACY_QUEUE_KEY);
    }
    return queue;
  } catch {
    return [];
  }
}

/**
 * Limpia la cola offline tras sincronización exitosa en base de datos
 */
export function clearOfflineQueue() {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (e) {
    console.error('Error limpiando cola offline:', e);
  }
}

/**
 * Sincroniza la cola local offline directamente con Cloud SQL / Supabase (/api/payments)
 */
export async function syncOfflineQueueWithServer(): Promise<{ syncedCount: number; errors: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { syncedCount: 0, errors: 0 };

  let syncedCount = 0;
  let errors = 0;
  const remainingQueue: OfflineQueueItem[] = [];

  for (const item of queue) {
    try {
      const payload = {
        id: item.id.replace('off-', 'led-'),
        receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
        loanId: item.loanId,
        clientId: item.clientId,
        clientName: item.clientName,
        routeId: item.routeId || 'route-1',
        amount: item.amount,
        principalPortion: Math.round(item.amount * 0.8),
        interestPortion: Math.round(item.amount * 0.2),
        paymentMethod: item.paymentMethod,
        preBalance: item.amount * 2,
        postBalance: Math.max(0, item.amount * 2 - item.amount),
        timestamp: item.timestamp,
        gpsLocation: item.gpsLocation || '6.2442, -75.5812',
        hash: `sha256-${item.clientTxUuid}-${Date.now()}`,
        clientTxUuid: item.clientTxUuid,
      };

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        syncedCount++;
      } else {
        const errorData = await res.json().catch(() => ({}));
        // Si ya fue procesado previamente (idempotencia), contarlo como exitoso
        if (res.status === 409 || errorData.error?.includes('Ya existe')) {
          syncedCount++;
        } else {
          remainingQueue.push({
            ...item,
            retryCount: (item.retryCount || 0) + 1,
            lastError: errorData.error || `HTTP ${res.status}`,
          });
          errors++;
        }
      }
    } catch (err: any) {
      remainingQueue.push({
        ...item,
        retryCount: (item.retryCount || 0) + 1,
        lastError: err.message || 'Error de red',
      });
      errors++;
    }
  }

  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
  } catch (err) {
    console.error('Error actualizando cola offline:', err);
  }

  return { syncedCount, errors };
}
