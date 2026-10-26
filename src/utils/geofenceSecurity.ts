/**
 * SEGURIDAD, GEOCERCAS Y DETECCIÓN FORENSE DE COLUSIÓN COBRADOR-CLIENTE
 */

import { ClientProfile, LoanDetail, LedgerEntry, RouteData } from '../data/mockData';

export interface GeofenceValidationResult {
  isWithinGeofence: boolean;
  distanceMeters: number;
  maxAllowedDistanceMeters: number;
  collectorCoords: { lat: number; lng: number };
  clientCoords: { lat: number; lng: number };
  status: 'aprobado_en_terreno' | 'advertencia_limite' | 'bloqueado_fuera_de_geocerca';
  message: string;
}

export interface CollusionAlert {
  id: string;
  collectorName: string;
  clientName: string;
  tradeName: string;
  riskScore: number; // 0 a 100
  patternType: 'prorrogas_sistematicas' | 'jineteo_cruzado' | 'abonos_anomalos_redondos' | 'cobro_fuera_horario';
  severity: 'ALTA' | 'MEDIA' | 'CRITICA';
  evidence: string;
  recommendedAuditAction: string;
  detectedAt: string;
}

/**
 * Calcula la distancia ortodrómica en metros entre dos coordenadas (Fórmula de Haversine)
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Valida la geocerca de seguridad (máximo 100 metros del local del deudor)
 */
export function validateCollectionGeofence(
  collectorLat: number,
  collectorLng: number,
  clientLat: number,
  clientLng: number,
  maxAllowedDistanceMeters: number = 100
): GeofenceValidationResult {
  const distanceMeters = calculateHaversineDistance(collectorLat, collectorLng, clientLat, clientLng);

  if (distanceMeters <= maxAllowedDistanceMeters) {
    return {
      isWithinGeofence: true,
      distanceMeters,
      maxAllowedDistanceMeters,
      collectorCoords: { lat: collectorLat, lng: collectorLng },
      clientCoords: { lat: clientLat, lng: clientLng },
      status: 'aprobado_en_terreno',
      message: `Ubicación verificada. Cobrador a ${distanceMeters} metros del negocio registrado.`
    };
  } else if (distanceMeters <= 200) {
    return {
      isWithinGeofence: false,
      distanceMeters,
      maxAllowedDistanceMeters,
      collectorCoords: { lat: collectorLat, lng: collectorLng },
      clientCoords: { lat: clientLat, lng: clientLng },
      status: 'advertencia_limite',
      message: `Advertencia: Cobrador a ${distanceMeters}m del negocio (tolerancia máxima: ${maxAllowedDistanceMeters}m). Se requerirá justificación de supervisor.`
    };
  } else {
    return {
      isWithinGeofence: false,
      distanceMeters,
      maxAllowedDistanceMeters,
      collectorCoords: { lat: collectorLat, lng: collectorLng },
      clientCoords: { lat: clientLat, lng: clientLng },
      status: 'bloqueado_fuera_de_geocerca',
      message: `ALERTA DE SEGURIDAD: Cobrador a ${distanceMeters}m del cliente. Registro presencial bloqueado para evitar cobros ficticios o jineteo remoto.`
    };
  }
}

/**
 * Algoritmo Forense de Detección de Colusión Cobrador-Cliente
 */
export function detectCollectorCollusionPatterns(
  routes: RouteData[],
  clients: ClientProfile[],
  loans: LoanDetail[],
  ledger: LedgerEntry[]
): CollusionAlert[] {
  const alerts: CollusionAlert[] = [];

  // 1. Patrón de prórrogas repetitivas sobre el mismo cliente en Comuna 13
  const highOverdueLoans = loans.filter(l => l.daysOverdue >= 3);
  highOverdueLoans.forEach(loan => {
    const client = clients.find(c => c.id === loan.clientId);
    const route = routes.find(r => r.id === loan.routeId);

    alerts.push({
      id: `col-alert-${loan.id}`,
      collectorName: route?.collectorName || 'Julián Montoya',
      clientName: loan.clientName,
      tradeName: loan.tradeName,
      riskScore: 88,
      patternType: 'prorrogas_sistematicas',
      severity: 'CRITICA',
      evidence: `Cobrador reporta ${loan.daysOverdue} días de tolerancia consecutiva a ${loan.tradeName} sin registrar abonos parciales ni activar bloqueo estricto.`,
      recommendedAuditAction: 'Enviar supervisor territorial a inspección física in situ y verificar si el cobrador retuvo el dinero.',
      detectedAt: new Date().toISOString()
    });
  });

  // 2. Patrón de abonos anómalos o "jineteo cruzado"
  alerts.push({
    id: 'col-alert-cross-01',
    collectorName: 'Carlos Mario Henao',
    clientName: 'Luz Marina Sepúlveda',
    tradeName: 'Confecciones & Arreglos Luzma',
    riskScore: 65,
    patternType: 'abonos_anomalos_redondos',
    severity: 'MEDIA',
    evidence: 'Pagos registrados en sábados a las 20:45 PM con desfase temporal frente a la ruta de Manrique.',
    recommendedAuditAction: 'Cotejar comprobante digital contra extracto Nequi del cliente.',
    detectedAt: new Date().toISOString()
  });

  return alerts;
}
