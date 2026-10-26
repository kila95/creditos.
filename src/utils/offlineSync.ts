/**
 * MOTOR DE SINCRONIZACIÓN OFFLINE (PWA & LOCAL STORAGE QUEUE)
 * Garantiza resiliencia en zonas de baja cobertura celular en comunas de Medellín
 */

import { useState, useEffect } from 'react';
import { LedgerEntry } from '../data/mockData';

const OFFLINE_QUEUE_KEY = 'rutacapital_offline_collection_queue';

export interface OfflineQueueItem {
  id: string;
  loanId: string;
  clientId: string;
  clientName: string;
  amount: number;
  paymentMethod: 'efectivo' | 'nequi' | 'daviplata';
  notes: string;
  timestamp: string;
  gpsLocation: string;
  isSynced: boolean;
}

/**
 * Hook para detectar conectividad en tiempo real en la calle
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Guarda un cobro en la cola local si no hay internet
 */
export function enqueueOfflinePayment(item: Omit<OfflineQueueItem, 'id' | 'isSynced'>): OfflineQueueItem {
  const queue = getOfflineQueue();
  const newItem: OfflineQueueItem = {
    ...item,
    id: `off-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    isSynced: false
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
    const data = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
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
 * Sincroniza la cola local offline directamente con Cloud SQL (/api/payments)
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
        routeId: 'route-1',
        amount: item.amount,
        principalPortion: Math.round(item.amount * 0.8),
        interestPortion: Math.round(item.amount * 0.2),
        paymentMethod: item.paymentMethod,
        preBalance: item.amount * 2, // Estimación local
        postBalance: Math.max(0, item.amount * 2 - item.amount),
        timestamp: item.timestamp,
        gpsLocation: item.gpsLocation,
        hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
      };

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        syncedCount++;
      } else {
        remainingQueue.push(item);
        errors++;
      }
    } catch {
      remainingQueue.push(item);
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
