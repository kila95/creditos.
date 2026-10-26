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
 * Limpia la cola offline tras sincronización exitosa en Supabase
 */
export function clearOfflineQueue() {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (e) {
    console.error('Error limpiando cola offline:', e);
  }
}
