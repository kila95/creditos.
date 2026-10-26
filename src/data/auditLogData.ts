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

export const INITIAL_AUDIT_LOGS: AuditLogItem[] = [];

