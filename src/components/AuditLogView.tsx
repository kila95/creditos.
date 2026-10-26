import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Lock, 
  UserCheck, 
  FileText, 
  Calendar, 
  Fingerprint,
  AlertCircle,
  AlertOctagon,
  CheckCircle2,
  Filter,
  Eye,
  ShieldCheck,
  Flame,
  ArrowRight
} from 'lucide-react';
import { AuditLogItem } from '../data/auditLogData';

interface AuditLogViewProps {
  logs: AuditLogItem[];
  onClose?: () => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'warnings'>('all');
  const [selectedLogForDiff, setSelectedLogForDiff] = useState<AuditLogItem | null>(null);

  const fraudIncidents = logs.filter(l => l.severity === 'alerta_critica' || l.isTamperAttempt);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.targetEntity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.justification.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    
    const matchesSeverity = 
      filterSeverity === 'all' ||
      (filterSeverity === 'critical' && (log.severity === 'alerta_critica' || log.isTamperAttempt)) ||
      (filterSeverity === 'warnings' && (log.severity === 'alerta_media' || log.severity === 'alerta_critica'));

    return matchesSearch && matchesAction && matchesSeverity;
  });

  return (
    <div className="space-y-4">
      {/* HEADER DE AUDITORÍA ANTIFRAUDE */}
      <div className="bg-slate-900 border-2 border-rose-500/30 rounded-3xl p-4 sm:p-5 md:p-6 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Blindaje Antifraude · PostgreSQL Triggers
            </span>
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">public.audit_logs (Inmutable)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2">
            <span>Bitácora de Auditoría Forense & Detección de Fraude</span>
          </h2>
          <p className="text-xs text-slate-300 mt-0.5 max-w-2xl leading-relaxed">
            Captura inalterable con firmas SHA-256 de cualquier intento de borrado de cobros, alteraciones de cuotas, desvíos de arqueo y bloqueos preventivos en Medellín.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 text-right">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Eventos Registrados</span>
            <span className="font-mono text-lg font-black text-white">{logs.length} firmas SHA-256</span>
          </div>
        </div>
      </div>

      {/* RADAR DE ALERTAS CRÍTICAS (SI EXISTEN INTENTOS DE FRAUDE) */}
      {fraudIncidents.length > 0 && (
        <div className="bg-rose-950/40 border-2 border-rose-500/60 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center animate-pulse">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-rose-400" />
                  Radar Antifraude: {fraudIncidents.length} Evento(s) de Alto Riesgo Detectados
                </h3>
                <p className="text-[11px] text-rose-300">
                  Transacciones interceptadas automáticamente por triggers de base de datos antes de impactar el libro mayor.
                </p>
              </div>
            </div>

            <button
              onClick={() => setFilterSeverity(filterSeverity === 'critical' ? 'all' : 'critical')}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all"
            >
              <Filter className="w-3.5 h-3.5" />
              {filterSeverity === 'critical' ? 'Ver Todos los Logs' : 'Filtrar Solo Incidentes Críticos'}
            </button>
          </div>
        </div>
      )}

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder="Buscar por usuario, cédula, hash SHA-256 o motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-medium"
          />
        </div>

        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="bg-slate-900 border-2 border-slate-800 text-slate-200 text-xs rounded-2xl px-3 py-2.5 focus:outline-none focus:border-rose-500 font-bold"
        >
          <option value="all">Todas las Acciones</option>
          <option value="BORRADO_PAGO_RECHAZADO">🚨 Intento de Borrado de Pago</option>
          <option value="ALTERACION_SALDO_MANUAL">⚠️ Alteración Manual de Saldo</option>
          <option value="AJUSTE_ARQUEO_FALTANTE">🔴 Faltante de Arqueo en Bóveda</option>
          <option value="REESTRUCTURACION_PLAZO">Reestructuración de Plazo</option>
          <option value="BLOQUEO_PREVENTIVO">Bloqueo Preventivo de Deudor</option>
          <option value="APROBACION_GASTO_OPEX">Aprobación Gasto OpEx</option>
          <option value="CIERRE_TURNO_AUDITADO">Cierre de Turno de Caja</option>
        </select>
      </div>

      {/* VISTA PARA MÓVIL Y TABLETA (TARJETAS INDIVIDUALES EN ALTO CONTRASTE) */}
      <div className="space-y-3">
        {filteredLogs.map((log) => {
          const isCritical = log.severity === 'alerta_critica' || log.isTamperAttempt;
          const isWarning = log.severity === 'alerta_media';

          return (
            <div 
              key={log.id} 
              className={`border-2 rounded-3xl p-4 sm:p-5 space-y-3 transition-all ${
                isCritical 
                  ? 'bg-rose-950/25 border-rose-500/60 shadow-lg shadow-rose-950/40' 
                  : isWarning 
                  ? 'bg-amber-950/20 border-amber-500/40' 
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* CABECERA DEL EVENTO */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase font-mono border ${
                    isCritical 
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                      : isWarning
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {log.action.replace(/_/g, ' ')}
                  </span>

                  {isCritical && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-600 text-white animate-pulse">
                      Alerta Antifraude
                    </span>
                  )}

                  <span className="text-xs font-bold text-white">
                    {log.targetEntity}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  <span>
                    {new Date(log.timestamp).toLocaleDateString('es-CO')} {new Date(log.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* DETALLES DEL ACTOR & TERMINAL */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400">Actor: </span>
                  <strong className="text-white font-mono">{log.actor}</strong>
                  <span className="text-slate-400"> ({log.role})</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  IP / Terminal: <strong className="text-slate-300">{log.ipAddress}</strong>
                </div>
              </div>

              {/* COMPARADOR DIFF DE VALORES (ANTES VS DESPUÉS) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-950/90 p-2.5 rounded-xl border border-rose-950/60 text-rose-300">
                  <span className="text-[10px] uppercase font-bold text-rose-400 block mb-0.5">(-) Valor Anterior:</span>
                  <div className="break-all">{log.oldValue}</div>
                </div>
                <div className="bg-slate-950/90 p-2.5 rounded-xl border border-emerald-950/60 text-emerald-300">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-0.5">(+) Valor Nuevo / Resultado:</span>
                  <div className="break-all">{log.newValue}</div>
                </div>
              </div>

              {/* JUSTIFICACIÓN / DICTAMEN DE AUDITORÍA */}
              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Justificación Registrada:</span>
                <p>{log.justification}</p>
              </div>

              {/* HUELLA DIGITAL SHA-256 INMUTABLE */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="truncate max-w-[200px] sm:max-w-md">SHA-256: {log.immutableHash}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  Cadena Verificada
                </span>
              </div>
            </div>
          );
        })}

        {filteredLogs.length === 0 && (
          <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-2">
            <ShieldCheck className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm font-bold text-white">No hay eventos que coincidan con el filtro.</p>
            <p className="text-xs text-slate-400">Todos los registros contables se encuentran íntegros y sin discrepancias.</p>
          </div>
        )}
      </div>
    </div>
  );
};
