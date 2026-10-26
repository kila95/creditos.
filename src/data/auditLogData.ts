export interface AuditLogItem {
  id: string;
  timestamp: string;
  actor: string;
  role: 'Administrador CFO' | 'Auditor Bóveda' | 'Supervisor de Ruta';
  action: 
    | 'REESTRUCTURACION_PLAZO'
    | 'BLOQUEO_PREVENTIVO'
    | 'DESBLOQUEO_CLIENTE'
    | 'AJUSTE_ARQUEO_FALTANTE'
    | 'APROBACION_GASTO_OPEX'
    | 'REASIGNACION_BARRIO'
    | 'CIERRE_TURNO_AUDITADO'
    | 'BORRADO_PAGO_RECHAZADO'
    | 'ALTERACION_SALDO_MANUAL'
    | 'MODIFICACION_CUOTA_RECHAZADA'
    | 'ABONO_PARCIAL_REGISTRADO'
    | 'PRORROGA_PLAZO_AUTORIZADA';
  targetEntity: string;
  targetId: string;
  oldValue: string;
  newValue: string;
  justification: string;
  ipAddress: string;
  immutableHash: string;
  severity?: 'normal' | 'alerta_media' | 'alerta_critica';
  isTamperAttempt?: boolean;
}

export const INITIAL_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'aud-000-fraud',
    timestamp: '2026-10-26T07:48:15-05:00',
    actor: 'cobrador@rutacapital.co (San Javier)',
    role: 'Supervisor de Ruta',
    action: 'BORRADO_PAGO_RECHAZADO',
    targetEntity: 'public.daily_ledger (REC-982144)',
    targetId: 'led-982144',
    oldValue: 'amount_received: $50.000 COP, post_balance: $350.000 COP',
    newValue: 'DELETE PROHIBIDO: Bloqueado por Trigger trg_prevent_daily_ledger_tampering',
    justification: 'ALERTA ANTIFRAUDE: Intento de eliminación física de un registro de recaudo en efectivo reportado hace 30 minutos. Motor RLS abortó la transacción (Rollback forzado).',
    ipAddress: '190.28.140.21 (Antena Móvil San Javier)',
    immutableHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    severity: 'alerta_critica',
    isTamperAttempt: true
  },
  {
    id: 'aud-001',
    timestamp: '2026-10-26T07:15:22-05:00',
    actor: 'admin@rutacapital.co',
    role: 'Administrador CFO',
    action: 'BLOQUEO_PREVENTIVO',
    targetEntity: 'clients (Robinson Galeano)',
    targetId: 'cli-3',
    oldValue: 'hasPreventiveBlock: false, daysOverdue: 1',
    newValue: 'hasPreventiveBlock: true, daysOverdue: 3',
    justification: 'Disparo automático por protocolo de riesgo: >= 2 días consecutivos sin reporte de cuota ni abono parcial en Comuna 13.',
    ipAddress: '190.157.24.81 (Medellín, CO)',
    immutableHash: '4f29a0b1c83d69e82c5a17d840ef91bc128479e0a2b84920',
    severity: 'alerta_media'
  },
  {
    id: 'aud-002',
    timestamp: '2026-10-26T07:35:10-05:00',
    actor: 'auditoria@rutacapital.co',
    role: 'Auditor Bóveda',
    action: 'APROBACION_GASTO_OPEX',
    targetEntity: 'route_expenses (Combustible)',
    targetId: 'exp-1',
    oldValue: 'is_approved: false',
    newValue: 'is_approved: true, amount: $22,000 COP',
    justification: 'Verificación fotográfica de factura digital estación Terpel San Juan ruta Comuna 13.',
    ipAddress: '181.139.112.5 (Oficina Central Medellín)',
    immutableHash: '7a18f4c20b82194c77ea10c4928d910248a7364920b17849',
    severity: 'normal'
  },
  {
    id: 'aud-003',
    timestamp: '2026-10-25T18:40:00-05:00',
    actor: 'cfo_master@rutacapital.co',
    role: 'Administrador CFO',
    action: 'CIERRE_TURNO_AUDITADO',
    targetEntity: 'daily_cash_shifts (Ruta 02 Manrique)',
    targetId: 'shift-manrique-25',
    oldValue: 'status: abierta',
    newValue: 'status: auditada_ok, actualCash: $1,280,000 COP, discrepancy: $0',
    justification: 'Conteo físico exacto en sobre sellado entregado en bóveda por el cobrador Carlos Mario Henao.',
    ipAddress: '190.157.24.81 (Sede Central)',
    immutableHash: '9d21ab664c184029ebfa0092147da8b39218d840192ea190',
    severity: 'normal'
  },
  {
    id: 'aud-004',
    timestamp: '2026-10-25T14:10:00-05:00',
    actor: 'cfo_master@rutacapital.co',
    role: 'Administrador CFO',
    action: 'REESTRUCTURACION_PLAZO',
    targetEntity: 'loans (PREST-C13-003)',
    targetId: 'loan-3',
    oldValue: 'term: 24d, installment: $45.000 COP',
    newValue: 'term: 35d, installment: $31.000 COP, status: refinanciado',
    justification: 'Acuerdo de reestructuración con el fiador Darío Galeano para evitar paso a cobro prejurídico.',
    ipAddress: '190.157.24.81',
    immutableHash: '12fa9831bc4028df1984201849201aebfc09182371902834',
    severity: 'alerta_media'
  },
  {
    id: 'aud-005',
    timestamp: '2026-10-24T19:05:00-05:00',
    actor: 'auditoria@rutacapital.co',
    role: 'Auditor Bóveda',
    action: 'AJUSTE_ARQUEO_FALTANTE',
    targetEntity: 'cash_drawer_sessions (Ruta 03 Belén)',
    targetId: 'shift-belen-24',
    oldValue: 'discrepancy: $0',
    newValue: 'discrepancy: -$15.000 COP, status: faltante',
    justification: 'Faltante de $15.000 COP no justificado en sobre sellado. Aplicado descuento preventivo a fondo de fianza del cobrador.',
    ipAddress: '181.139.112.5',
    immutableHash: 'bb401928dfa0029481729018471920847192019481720491',
    severity: 'alerta_critica'
  }
];
