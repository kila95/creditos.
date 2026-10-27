/**
 * MOTOR DE SCORING PREDICTIVO Y DETECCIÓN DE ANOMALÍAS EN RUTA
 * Especializado en microcrédito urbano de alta frecuencia
 */

import { ClientProfile, LoanDetail, RouteData, LedgerEntry, RouteExpenseItem } from '../data/mockData';

export type RiskLevel = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface ClientScoreResult {
  clientId: string;
  clientName: string;
  tradeName: string;
  score: number; // 0 a 100
  riskLevel: RiskLevel;
  maxApprovedCreditLimit: number;
  factors: {
    punctualityRate: number; // % pagos a tiempo
    preferredPaymentWindow: 'matutino_temprano' | 'mediodia' | 'tarde_noche';
    extensionRequestsCount: number; // solicitudes de prórroga
    historicRepaidCreditsCount: number;
    daysOverdueCurrent: number;
  };
  recommendation: string;
}

export interface RouteAnomaly {
  id: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  collectorName: string;
  type: 'caida_drastica_recaudo' | 'retraso_sincronizacion' | 'mora_inusual_sector' | 'opex_excesivo';
  severity: 'critica' | 'moderada' | 'baja';
  metricObserved: string;
  metricBenchmark: string;
  differencePercent: number;
  message: string;
  timestamp: string;
}

/**
 * Evalúa el comportamiento de pago de un cliente para asignarle Score y Nivel de Riesgo
 */
export function calculateClientCreditScore(
  client?: ClientProfile | null,
  loan?: LoanDetail | null,
  allClientLedgerEntries: LedgerEntry[] = []
): ClientScoreResult {
  // Manejo de datos nulos para administradores o clientes recién creados sin historial
  if (!client) {
    return {
      clientId: 'sin_id',
      clientName: 'Sin Cliente Seleccionado',
      tradeName: 'Aún sin micronegocio vinculado',
      score: 50,
      riskLevel: 'AMARILLO',
      maxApprovedCreditLimit: 0,
      factors: {
        punctualityRate: 0,
        preferredPaymentWindow: 'matutino_temprano',
        extensionRequestsCount: 0,
        historicRepaidCreditsCount: 0,
        daysOverdueCurrent: 0,
      },
      recommendation:
        'Aún no hay datos de riesgo calculados para este administrador o cliente. Registre créditos para activar el motor algorítmico.',
    };
  }

  let score = 75; // Base neutral

  // 1. Días de mora actuales con encadenamiento opcional y fallback seguro
  const daysOverdue = loan?.daysOverdue ?? client?.daysOverdue ?? 0;
  if (daysOverdue === 0) {
    score += 15;
  } else if (daysOverdue === 1) {
    score -= 10;
  } else if (daysOverdue === 2) {
    score -= 30; // Alerta temprana
  } else {
    score -= 55; // Mora severa >= 3 días
  }

  // 2. Historial de cuotas pagadas
  const installmentsPaid = loan?.installmentsPaid ?? 0;
  const termDays = loan?.termDays ?? 24;
  const progressRatio = termDays > 0 ? installmentsPaid / termDays : 0;
  if (progressRatio > 0.6 && daysOverdue === 0) {
    score += 10;
  }

  // 3. Ventana horaria de pago en el ledger
  let preferredWindow: 'matutino_temprano' | 'mediodia' | 'tarde_noche' = 'matutino_temprano';
  const safeLedger = Array.isArray(allClientLedgerEntries) ? allClientLedgerEntries : [];
  if (safeLedger.length > 0) {
    const morningCount = safeLedger.filter((e) => {
      try {
        const hour = new Date(e?.timestamp || Date.now()).getHours();
        return hour < 12;
      } catch {
        return false;
      }
    }).length;
    if (morningCount / safeLedger.length >= 0.7) {
      preferredWindow = 'matutino_temprano';
      score += 5; // Negocio ordenado que abre temprano y tiene caja
    } else {
      preferredWindow = 'tarde_noche';
    }
  }

  // 4. Bloqueo preventivo
  if (client?.hasPreventiveBlock) {
    score = Math.min(score, 35);
  }

  // Asegurar rango 0 - 100
  score = Math.max(5, Math.min(99, score));

  // Clasificación por nivel de riesgo
  let riskLevel: RiskLevel = 'VERDE';
  let maxLimit = 1500000;
  let recommendation = 'Aprobación inmediata con cupo estándar o incrementado.';

  if (score >= 80) {
    riskLevel = 'VERDE';
    maxLimit = 2500000;
    recommendation =
      'Cliente AAA con alta liquidez matutina. Apto para ampliación de cupo con tasa preferencial.';
  } else if (score >= 50) {
    riskLevel = 'AMARILLO';
    maxLimit = 800000;
    recommendation =
      'Riesgo moderado. Requiere confirmación diaria del fiador y cupo restringido a máximo 20 días.';
  } else {
    riskLevel = 'ROJO';
    maxLimit = 0;
    recommendation =
      'Riesgo Crítico. No aprobar nuevos créditos hasta liquidar saldos insolutos pendientes.';
  }

  return {
    clientId: client?.id || 'sin_id',
    clientName: client?.name || 'Cliente sin nombre',
    tradeName: client?.tradeName || 'Micronegocio local',
    score,
    riskLevel,
    maxApprovedCreditLimit: maxLimit,
    factors: {
      punctualityRate: daysOverdue === 0 ? 96 : daysOverdue === 1 ? 80 : 45,
      preferredPaymentWindow: preferredWindow,
      extensionRequestsCount: daysOverdue >= 2 ? 2 : 0,
      historicRepaidCreditsCount: client?.riskTier === 'A_excelente' ? 4 : 1,
      daysOverdueCurrent: daysOverdue,
    },
    recommendation,
  };
}

/**
 * Detecta anomalías estadísticas en las rutas de recaudo para alertar al Administrador/CFO
 */
export function detectRouteAnomalies(
  routes: RouteData[] = [],
  loans: LoanDetail[] = [],
  expenses: RouteExpenseItem[] = []
): RouteAnomaly[] {
  const anomalies: RouteAnomaly[] = [];
  const safeRoutes = Array.isArray(routes) ? routes : [];

  safeRoutes.forEach((route) => {
    if (!route) return;

    const dailyExpected = route?.dailyGrossExpected ?? 0;
    const dailyCollected = route?.dailyGrossCollected ?? 0;
    const targetRate = route?.targetRecoveryRate ?? 95.0;
    const par1Rate = route?.par1Rate ?? 0;
    const dailyExpenses = route?.dailyExpenses ?? 0;

    // 1. Caída drástica en el recaudo diario respecto a la meta esperada
    const recoveryRatio = dailyExpected > 0 ? (dailyCollected / dailyExpected) * 100 : 100;

    if (recoveryRatio < 85 && dailyExpected > 0) {
      anomalies.push({
        id: `anom-drop-${route.id || Math.random()}`,
        routeId: route.id || 'route-1',
        routeCode: route.code || 'RUTA',
        routeName: route.name || 'Ruta Local',
        collectorName: route.collectorName || 'Cobrador de Zona',
        type: 'caida_drastica_recaudo',
        severity: recoveryRatio < 75 ? 'critica' : 'moderada',
        metricObserved: `${recoveryRatio.toFixed(1)}% recaudado`,
        metricBenchmark: `Meta histórica: ${targetRate}%`,
        differencePercent: Number((targetRate - recoveryRatio).toFixed(1)),
        message: `Caída en recaudo de ${route.name || 'Ruta'}. Cobrado $${dailyCollected.toLocaleString()} COP vs esperado $${dailyExpected.toLocaleString()} COP. Posible iliquidez en sector.`,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Tasa de morosidad PAR-1 elevada en la zona
    if (par1Rate > 6.0) {
      anomalies.push({
        id: `anom-par-${route.id || Math.random()}`,
        routeId: route.id || 'route-1',
        routeCode: route.code || 'RUTA',
        routeName: route.name || 'Ruta Local',
        collectorName: route.collectorName || 'Cobrador de Zona',
        type: 'mora_inusual_sector',
        severity: par1Rate > 8.0 ? 'critica' : 'moderada',
        metricObserved: `PAR-1: ${par1Rate}%`,
        metricBenchmark: 'Umbral seguro: ≤ 4.5%',
        differencePercent: Number((par1Rate - 4.5).toFixed(1)),
        message: `Mora de alerta temprana PAR-1 disparada en ${route.zone || 'zona'}. Se requiere supervisión de campo antes del cierre de turno.`,
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Gasto operativo desproporcionado respecto al recaudo
    const opexRatio = dailyCollected > 0 ? (dailyExpenses / dailyCollected) * 100 : 0;
    if (opexRatio > 4.5) {
      anomalies.push({
        id: `anom-opex-${route.id || Math.random()}`,
        routeId: route.id || 'route-1',
        routeCode: route.code || 'RUTA',
        routeName: route.name || 'Ruta Local',
        collectorName: route.collectorName || 'Cobrador de Zona',
        type: 'opex_excesivo',
        severity: 'moderada',
        metricObserved: `OpEx: ${opexRatio.toFixed(1)}% del recaudo`,
        metricBenchmark: 'Umbral máximo: 3.5%',
        differencePercent: Number((opexRatio - 3.5).toFixed(1)),
        message: `Gastos de ruta elevados ($${dailyExpenses.toLocaleString()} COP) en relación a los cobros reportados. Verificar tickets de combustible y viáticos.`,
        timestamp: new Date().toISOString(),
      });
    }
  });

  return anomalies;
}
