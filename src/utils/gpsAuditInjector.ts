import { supabase, isLiveSupabaseConfigured } from '../services/supabaseAuth';
import { ClientProfile, LedgerEntry } from '../data/mockData';

export interface GpsPaymentCoordinates {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: string;
  isLiveSat: boolean;
  formatted: string;
}

export interface GpsAuditedPaymentRecord {
  id: string;
  receiptNumber: string;
  loanId: string;
  clientId: string;
  clientName: string;
  routeId: string;
  organizationId: string;
  amount: number;
  paymentMethod: 'efectivo' | 'nequi' | 'bancolombia' | 'daviplata';
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  clientExpectedLat: number;
  clientExpectedLng: number;
  distanceFromClientMeters: number;
  geofenceStatus: 'VERIFICADO_EN_SITIO' | 'DESVIACION_MEDIA' | 'ALERTA_DISTANCIA';
  isLiveSat: boolean;
  timestamp: string;
  supabaseSynced: boolean;
}

const GPS_AUDIT_STORAGE_KEY = 'enruta_gps_audit_records_v1';

/**
 * Fórmula de Haversine para calcular la distancia exacta en metros
 * entre la coordenada GPS donde el cobrador registró el abono y la ubicación del negocio del cliente.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Clasifica el estado de geocerca (Geofence) según la distancia entre el cobrador y el cliente.
 */
export function evaluateGeofenceStatus(
  distanceMeters: number
): 'VERIFICADO_EN_SITIO' | 'DESVIACION_MEDIA' | 'ALERTA_DISTANCIA' {
  if (distanceMeters <= 150) return 'VERIFICADO_EN_SITIO';
  if (distanceMeters <= 500) return 'DESVIACION_MEDIA';
  return 'ALERTA_DISTANCIA';
}

/**
 * Extrae latitud y longitud numéricas desde una cadena formateada "6.25180, -75.61420 (±12m SAT)"
 */
export function parseLatLngFromFormattedString(formatted?: string): {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  isLiveSat: boolean;
} {
  if (!formatted) {
    return {
      latitude: 6.2518,
      longitude: -75.6142,
      accuracyMeters: 18,
      isLiveSat: false,
    };
  }

  const coordMatch = formatted.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  const accMatch = formatted.match(/±(\d+)m/);
  const isLiveSat = formatted.includes('SAT') && !formatted.includes(' SIM');

  if (coordMatch) {
    return {
      latitude: parseFloat(coordMatch[1]),
      longitude: parseFloat(coordMatch[2]),
      accuracyMeters: accMatch ? parseInt(accMatch[1], 10) : 15,
      isLiveSat,
    };
  }

  return {
    latitude: 6.2518,
    longitude: -75.6142,
    accuracyMeters: 20,
    isLiveSat: false,
  };
}

/**
 * Captura coordenadas satelitales reales usando `navigator.geolocation.getCurrentPosition`
 * justo antes de enviar un pago a Supabase.
 */
export async function captureStrictGpsBeforePayment(): Promise<GpsPaymentCoordinates> {
  const nowIso = new Date().toISOString();

  if (typeof window !== 'undefined' && 'geolocation' in navigator) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        });
      });

      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));
      const accuracyMeters = Math.round(position.coords.accuracy || 10);

      return {
        latitude,
        longitude,
        accuracyMeters,
        timestamp: nowIso,
        isLiveSat: true,
        formatted: `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${accuracyMeters}m SAT)`,
      };
    } catch {
      // Fallback de telemetría urbana en Medellín cuando el navegador bloquea el permiso en iframe
    }
  }

  const baseLat = 6.2518 + (Math.random() - 0.5) * 0.008;
  const baseLng = -75.6142 + (Math.random() - 0.5) * 0.008;
  const latitude = Number(baseLat.toFixed(6));
  const longitude = Number(baseLng.toFixed(6));
  const accuracyMeters = Math.floor(8 + Math.random() * 14);

  return {
    latitude,
    longitude,
    accuracyMeters,
    timestamp: nowIso,
    isLiveSat: false,
    formatted: `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${accuracyMeters}m SIM)`,
  };
}

/**
 * Obtiene el historial local de auditoría GPS combinando los abonos del libro mayor (Ledger)
 * y los registros auditados almacenados.
 */
export function getStoredGpsAuditRecords(
  ledger: LedgerEntry[] = [],
  clients: ClientProfile[] = []
): GpsAuditedPaymentRecord[] {
  let savedRecords: GpsAuditedPaymentRecord[] = [];
  try {
    const raw = localStorage.getItem(GPS_AUDIT_STORAGE_KEY);
    if (raw) {
      savedRecords = JSON.parse(raw);
    }
  } catch {
    savedRecords = [];
  }

  const savedIds = new Set(savedRecords.map((r) => r.id));

  const derivedFromLedger: GpsAuditedPaymentRecord[] = ledger
    .filter((entry) => !savedIds.has(entry.id))
    .map((entry) => {
      const parsed = parseLatLngFromFormattedString(entry.gpsLocation);
      const latitude = entry.latitude ?? parsed.latitude;
      const longitude = entry.longitude ?? parsed.longitude;
      const accuracyMeters = entry.accuracyMeters ?? parsed.accuracyMeters;

      const client = clients.find((c) => c.id === entry.clientId);
      const clientExpectedLat = client?.lat ?? 6.2518;
      const clientExpectedLng = client?.lng ?? -75.6142;

      const distanceFromClientMeters = calculateHaversineDistanceMeters(
        latitude,
        longitude,
        clientExpectedLat,
        clientExpectedLng
      );

      return {
        id: entry.id,
        receiptNumber: entry.receiptNumber,
        loanId: entry.loanId,
        clientId: entry.clientId,
        clientName: entry.clientName,
        routeId: entry.routeId,
        organizationId: entry.organizationId || 'org-medellin-01',
        amount: entry.amount,
        paymentMethod: entry.paymentMethod,
        latitude,
        longitude,
        accuracyMeters,
        clientExpectedLat,
        clientExpectedLng,
        distanceFromClientMeters,
        geofenceStatus: evaluateGeofenceStatus(distanceFromClientMeters),
        isLiveSat: parsed.isLiveSat,
        timestamp: entry.timestamp,
        supabaseSynced: true,
      };
    });

  return [...savedRecords, ...derivedFromLedger].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Guarda un registro de auditoría GPS e inyecta `latitude` y `longitude` en la tabla de pagos de Supabase.
 */
export async function injectPaymentWithGpsToSupabase(params: {
  entry: LedgerEntry;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  isLiveSat: boolean;
  client?: ClientProfile;
}): Promise<GpsAuditedPaymentRecord> {
  const { entry, latitude, longitude, accuracyMeters, isLiveSat, client } = params;
  const clientExpectedLat = client?.lat ?? 6.2518;
  const clientExpectedLng = client?.lng ?? -75.6142;

  const distanceFromClientMeters = calculateHaversineDistanceMeters(
    latitude,
    longitude,
    clientExpectedLat,
    clientExpectedLng
  );
  const geofenceStatus = evaluateGeofenceStatus(distanceFromClientMeters);

  let supabaseSynced = false;

  if (isLiveSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      // 1. Intento de inserción con columnas explícitas latitude y longitude en daily_ledger
      const { error: extendedErr } = await supabase.from('daily_ledger').upsert(
        [
          {
            id: entry.id,
            receipt_number: entry.receiptNumber,
            loan_id: entry.loanId,
            client_id: entry.clientId,
            client_name: entry.clientName,
            route_id: entry.routeId,
            amount: entry.amount,
            principal_portion: entry.principalPortion,
            interest_portion: entry.interestPortion,
            payment_method: entry.paymentMethod,
            pre_balance: entry.preBalance,
            post_balance: entry.postBalance,
            timestamp: entry.timestamp,
            gps_location: entry.gpsLocation,
            latitude,
            longitude,
            accuracy_meters: accuracyMeters,
            hash: entry.hash,
          },
        ],
        { onConflict: 'id' }
      );

      if (!extendedErr) {
        supabaseSynced = true;
      } else {
        // Fallback si el esquema aún no tiene las columnas latitude / longitude
        const { error: fallbackErr } = await supabase.from('daily_ledger').upsert(
          [
            {
              id: entry.id,
              receipt_number: entry.receiptNumber,
              loan_id: entry.loanId,
              client_id: entry.clientId,
              client_name: entry.clientName,
              route_id: entry.routeId,
              amount: entry.amount,
              principal_portion: entry.principalPortion,
              interest_portion: entry.interestPortion,
              payment_method: entry.paymentMethod,
              pre_balance: entry.preBalance,
              post_balance: entry.postBalance,
              timestamp: entry.timestamp,
              gps_location: `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${accuracyMeters}m)`,
              hash: entry.hash,
            },
          ],
          { onConflict: 'id' }
        );
        if (!fallbackErr) {
          supabaseSynced = true;
        }
      }
    } catch (err) {
      console.warn('[GPS Audit Injector] Aviso al sincronizar coordenadas con Supabase:', err);
    }
  }

  const record: GpsAuditedPaymentRecord = {
    id: entry.id,
    receiptNumber: entry.receiptNumber,
    loanId: entry.loanId,
    clientId: entry.clientId,
    clientName: entry.clientName,
    routeId: entry.routeId,
    organizationId: entry.organizationId || 'org-medellin-01',
    amount: entry.amount,
    paymentMethod: entry.paymentMethod,
    latitude,
    longitude,
    accuracyMeters,
    clientExpectedLat,
    clientExpectedLng,
    distanceFromClientMeters,
    geofenceStatus,
    isLiveSat,
    timestamp: entry.timestamp,
    supabaseSynced,
  };

  try {
    const existingRaw = localStorage.getItem(GPS_AUDIT_STORAGE_KEY);
    const existing: GpsAuditedPaymentRecord[] = existingRaw ? JSON.parse(existingRaw) : [];
    const updated = [record, ...existing.filter((r) => r.id !== record.id)].slice(0, 200);
    localStorage.setItem(GPS_AUDIT_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }

  return record;
}
