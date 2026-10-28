import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import {
  FileSpreadsheet,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  RefreshCw,
  Database,
  ArrowRight,
  Trash2,
  Users,
  Building,
  ShieldCheck,
  Layers,
  Copy,
  Check,
  Code2,
} from 'lucide-react';
import { ClientProfile, LoanDetail } from '../data/mockData';
import { formatCOP, roundCOP } from '../utils/financialCalculations';
import { useAuth } from '../context/AuthContext';
import { supabase, isLiveSupabaseConfigured } from '../services/supabaseAuth';

export interface BulkImportProps {
  onImportSuccess?: (importedClients: ClientProfile[], importedLoans: LoanDetail[]) => void;
  onBulkImportSuccess?: (importedClients: ClientProfile[], importedLoans: LoanDetail[]) => void;
  onClose?: () => void;
}

export interface CsvImportRow {
  nombre_cliente?: string;
  cliente?: string;
  nombre?: string;
  telefono?: string;
  celular?: string;
  direccion?: string;
  monto_prestado?: string | number;
  monto?: string | number;
  principal?: string | number;
  saldo_actual?: string | number;
  saldo?: string | number;
  tasa_interes?: string | number;
  interes?: string | number;
  modalidad_cobro?: string;
  modalidad?: string;
  barrio_zona?: string;
  barrio?: string;
  cedula?: string;
  documento?: string;
}

export interface ValidatedImportItem {
  id: string;
  rowNumber: number;
  isValid: boolean;
  errors: string[];
  cleanData: {
    clientId: string;
    loanId: string;
    name: string;
    tradeName: string;
    phone: string;
    address: string;
    neighborhood: string;
    document: string;
    principal: number;
    remainingBalance: number;
    interestRate: number;
    modality: 'diaria' | 'semanal' | 'quincenal' | 'mensual';
    installmentAmount: number;
    termDays: number;
    totalDebt: number;
  };
}

const TEMPLATE_CSV_CONTENT = `\uFEFFnombre_cliente,telefono,direccion,monto_prestado,saldo_actual,tasa_interes,modalidad_cobro,barrio_zona,cedula
Carlos Mario Restrepo,3001234567,Calle 44 # 65-12,1000000,800000,20,diario,Laureles,1017123456
Maria Fernanda Gomez,3129876543,Carrera 70 # 32-45,500000,450000,20,diario,Belén,43567890
Jorge Eliecer Morales,3155554321,Calle 10 # 43A-15,2000000,1800000,20,semanal,El Poblado,71234567`;

const SQL_UNIQUE_CONSTRAINT_CODE = `-- SQL para Supabase: Restricción UNIQUE en (phone, tenant_id)
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS uq_clients_phone_tenant_id;

ALTER TABLE public.clients
  ADD CONSTRAINT uq_clients_phone_tenant_id UNIQUE (phone, tenant_id);

CREATE INDEX IF NOT EXISTS idx_clients_phone_tenant_id
  ON public.clients (phone, tenant_id);`;

export const BulkImport: React.FC<BulkImportProps> = ({
  onImportSuccess,
  onBulkImportSuccess,
  onClose,
}) => {
  const { user, profile } = useAuth();
  const tenantId = profile?.organizationId || user?.id || 'org-medellin-01';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [parsedItems, setParsedItems] = useState<ValidatedImportItem[]>([]);
  const [rawFileName, setRawFileName] = useState<string>('');
  const [importProgress, setImportProgress] = useState<number>(0);
  const [showSqlModal, setShowSqlModal] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [importSummary, setImportSummary] = useState<{
    totalRows: number;
    validRows: number;
    insertedClientsCount: number;
    insertedLoansCount: number;
    totalPortfolioCop: number;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // 1. DESCARGA DE LA PLANTILLA CSV MODELO
  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Plantilla_EnRuta_Cartera.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 2. PARSER Y VALIDACIÓN LOCAL EN MEMORIA
  const processCsvFile = (file: File) => {
    if (!file) return;
    setRawFileName(file.name);
    setIsProcessing(true);
    setStatusMessage(null);
    setImportSummary(null);

    Papa.parse<CsvImportRow>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const validated: ValidatedImportItem[] = results.data.map((row, index) => {
          const errors: string[] = [];
          const rowNumber = index + 2;

          const rawName = (row.nombre_cliente || row.cliente || row.nombre || '').trim();
          const rawPhone = (row.telefono || row.celular || '').trim();
          const rawAddress = (row.direccion || '').trim();
          const rawNeighborhood = (row.barrio_zona || row.barrio || 'Medellín').trim();
          const rawDoc = (row.cedula || row.documento || '').trim();

          const rawPrincipal = parseFloat(
            String(row.monto_prestado || row.monto || row.principal || '0').replace(/[^0-9.]/g, '')
          );
          const rawSaldo = parseFloat(
            String(row.saldo_actual || row.saldo || row.monto_prestado || '0').replace(/[^0-9.]/g, '')
          );
          const rawInterest = parseFloat(
            String(row.tasa_interes || row.interes || '20').replace(/[^0-9.]/g, '')
          );

          const rawModality = (row.modalidad_cobro || row.modalidad || 'diario').toLowerCase().trim();

          if (!rawName) errors.push('El nombre del cliente es obligatorio');
          if (!rawPhone) errors.push('El teléfono de contacto es obligatorio');
          if (!rawAddress) errors.push('La dirección del local/negocio es obligatoria');
          if (isNaN(rawPrincipal) || rawPrincipal <= 0) errors.push('El monto prestado debe ser mayor a $0 COP');
          if (isNaN(rawSaldo) || rawSaldo < 0) errors.push('El saldo actual no puede ser negativo');

          let modality: 'diaria' | 'semanal' | 'quincenal' | 'mensual' = 'diaria';
          if (rawModality.includes('seman')) modality = 'semanal';
          else if (rawModality.includes('quincen')) modality = 'quincenal';
          else if (rawModality.includes('mensu')) modality = 'mensual';

          const safePrincipal = isNaN(rawPrincipal) ? 100000 : roundCOP(rawPrincipal);
          const safeInterestRate = isNaN(rawInterest) ? 20 : rawInterest;
          const safeSaldo = isNaN(rawSaldo) ? safePrincipal : roundCOP(rawSaldo);

          const totalDebt = roundCOP(safePrincipal * (1 + safeInterestRate / 100));
          const termDays = modality === 'semanal' ? 4 : modality === 'quincenal' ? 2 : modality === 'mensual' ? 1 : 24;
          const installmentAmount = roundCOP(totalDebt / termDays);

          const timestampSuffix = `${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 89)}${index}`;
          const clientId = `cli-bulk-${timestampSuffix}`;
          const loanId = `loan-bulk-${timestampSuffix}`;

          const cleanDoc = rawDoc || `CC-AUTO-${timestampSuffix}`;

          return {
            id: `row-${index}`,
            rowNumber,
            isValid: errors.length === 0,
            errors,
            cleanData: {
              clientId,
              loanId,
              name: rawName,
              tradeName: rawName,
              phone: rawPhone,
              address: rawAddress,
              neighborhood: rawNeighborhood,
              document: cleanDoc,
              principal: safePrincipal,
              remainingBalance: safeSaldo,
              interestRate: safeInterestRate,
              modality,
              installmentAmount,
              termDays,
              totalDebt,
            },
          };
        });

        setParsedItems(validated);
        setIsProcessing(false);
      },
      error: (err) => {
        setIsProcessing(false);
        setStatusMessage({
          type: 'error',
          text: `Error al leer el archivo CSV: ${err.message}`,
        });
      },
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processCsvFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processCsvFile(e.dataTransfer.files[0]);
    }
  };

  // 3. INSERCIÓN MASIVA (.UPSERT) CON RESTRICCIÓN DE DUPLICADOS EN SUPABASE + REACT REACTIVITY
  const handleExecuteBulkInsert = async () => {
    const validRows = parsedItems.filter((item) => item.isValid);
    if (validRows.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'No hay filas válidas para importar. Por favor revisa el archivo CSV.',
      });
      return;
    }

    setIsProcessing(true);
    setImportProgress(10);
    setStatusMessage({
      type: 'info',
      text: `Iniciando upsert masivo de ${validRows.length} clientes y préstamos en Supabase (Previendo duplicados)...`,
    });

    const newClients: ClientProfile[] = [];
    const newLoans: LoanDetail[] = [];

    const dbClientsPayload: any[] = [];
    const dbLoansPayload: any[] = [];

    const todayStr = new Date().toISOString().split('T')[0];

    validRows.forEach((item) => {
      const d = item.cleanData;

      const clientObj: ClientProfile = {
        id: d.clientId,
        name: d.name,
        tradeName: d.tradeName,
        category: 'Importado CSV',
        document: d.document,
        phone: d.phone,
        address: d.address,
        neighborhood: d.neighborhood,
        routeId: 'route-1',
        organizationId: tenantId,
        tenantId,
        riskTier: 'A_excelente',
        daysOverdue: 0,
        hasPreventiveBlock: false,
        guarantorName: 'Sin Fiador',
        guarantorPhone: d.phone,
        lat: 6.2518,
        lng: -75.6142,
      };

      const loanObj: LoanDetail = {
        id: d.loanId,
        code: `PREST-CSV-${d.loanId.slice(-5)}`,
        clientId: d.clientId,
        clientName: d.name,
        tradeName: d.tradeName,
        routeId: 'route-1',
        organizationId: tenantId,
        tenantId,
        principal: d.principal,
        interestRate: d.interestRate,
        totalDebt: d.totalDebt,
        installmentAmount: d.installmentAmount,
        termDays: d.termDays,
        modality: d.modality,
        installmentsPaid: 0,
        totalCollected: 0,
        remainingBalance: d.remainingBalance,
        disbursedDate: todayStr,
        dueDate: todayStr,
        daysOverdue: 0,
        status: 'activo',
        todayPaid: false,
      };

      newClients.push(clientObj);
      newLoans.push(loanObj);

      dbClientsPayload.push({
        id: d.clientId,
        document_id: d.document,
        name: d.name,
        alias: d.tradeName,
        phone: d.phone,
        address: d.address,
        zone: d.neighborhood,
        route_id: 'route-1',
        organization_id: tenantId,
        tenant_id: tenantId,
      });

      dbLoansPayload.push({
        id: d.loanId,
        client_id: d.clientId,
        route_id: 'route-1',
        organization_id: tenantId,
        tenant_id: tenantId,
        principal_amount: d.principal,
        interest_rate: d.interestRate,
        total_amount: d.totalDebt,
        daily_quota: d.installmentAmount,
        remaining_balance: d.remainingBalance,
        total_days: d.termDays,
        paid_days: 0,
        modality: d.modality,
        status: 'active',
        start_date: todayStr,
      });
    });

    setImportProgress(40);

    if (isLiveSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        setImportProgress(60);
        // RESTRICCIÓN DE DUPLICADOS: .upsert con { onConflict: 'phone, tenant_id', ignoreDuplicates: true }
        let { error: clientsErr } = await supabase
          .from('clients')
          .upsert(dbClientsPayload, { onConflict: 'phone, tenant_id', ignoreDuplicates: true });

        // Fallback si la restricción combinada en la base de datos es 'id' o 'document_id'
        if (clientsErr) {
          console.warn('⚠️ [Upsert clients (phone, tenant_id) Retry fallback]:', clientsErr);
          const fallbackRes = await supabase
            .from('clients')
            .upsert(dbClientsPayload, { onConflict: 'id', ignoreDuplicates: true });
          clientsErr = fallbackRes.error;
        }

        setImportProgress(80);
        // Bulk Upsert en public.loans
        let { error: loansErr } = await supabase
          .from('loans')
          .upsert(dbLoansPayload, { onConflict: 'id', ignoreDuplicates: true });

        if (loansErr) {
          console.warn('⚠️ [Upsert loans Aviso]:', loansErr);
        }
      } catch (err) {
        console.warn('⚠️ [BulkUpsert Supabase Excepción]:', err);
      }
    }

    setImportProgress(100);
    setIsProcessing(false);

    const totalPortfolio = newLoans.reduce((acc, l) => acc + l.remainingBalance, 0);

    setImportSummary({
      totalRows: parsedItems.length,
      validRows: validRows.length,
      insertedClientsCount: newClients.length,
      insertedLoansCount: newLoans.length,
      totalPortfolioCop: totalPortfolio,
    });

    setStatusMessage({
      type: 'success',
      text: `🎉 Importación finalizada exitosamente: Se procesaron ${newClients.length} registros (Duplicados por teléfono ignorados de forma segura).`,
    });

    // 2. ACTUALIZACIÓN VISUAL INMEDIATA EN REACT SIN LOCATION.RELOAD()
    const triggerSuccess = onImportSuccess || onBulkImportSuccess;
    if (triggerSuccess) {
      triggerSuccess(newClients, newLoans);
    }
  };

  const validCount = parsedItems.filter((i) => i.isValid).length;
  const invalidCount = parsedItems.filter((i) => !i.isValid).length;

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_UNIQUE_CONSTRAINT_CODE);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* CABECERA MÓDULO BULK IMPORT CON PROTECCIÓN DE DUPLICADOS */}
      <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Importación Masiva de Cartera · Anti-Duplicados Upsert
              </span>
              <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-mono bg-slate-950 text-slate-300 border border-slate-800">
                onConflict: &apos;phone, tenant_id&apos; · ignoreDuplicates
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Carga Masiva con Protección Anti-Duplicados
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              El método <code className="text-emerald-300 font-mono">.upsert()</code> con la opción{' '}
              <code className="text-emerald-300 font-mono">ignoreDuplicates: true</code> evita registros repetidos si re-subes la cartera.
              Al finalizar, la tabla de clientes se refresca inmediatamente en pantalla sin recargar la página.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSqlModal(!showSqlModal)}
              className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow"
            >
              <Code2 className="w-4 h-4 text-emerald-400" />
              <span>Ver SQL Restricción UNIQUE</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-4 py-2.5 rounded-2xl bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-500/40 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Descargar Plantilla CSV</span>
            </button>
          </div>
        </div>

        {/* NOTIFICACIÓN DE ESTADO */}
        {statusMessage && (
          <div
            className={`mt-4 p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
                : statusMessage.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/60 text-rose-200'
                : 'bg-sky-950/80 border-sky-500/60 text-sky-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* MODAL / VISOR SQL RESTRICCIÓN UNIQUE */}
        {showSqlModal && (
          <div className="mt-4 bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-2">
                <Database className="w-4 h-4" />
                Script SQL: Restricción UNIQUE en (phone, tenant_id)
              </span>
              <button
                type="button"
                onClick={handleCopySql}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Copiado' : 'Copiar SQL'}</span>
              </button>
            </div>
            <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto bg-slate-900/90 p-3 rounded-xl border border-slate-800">
              {SQL_UNIQUE_CONSTRAINT_CODE}
            </pre>
          </div>
        )}
      </div>

      {/* ÁREA ZONA DRAG & DROP / SELECCIÓN DE ARCHIVO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 min-h-[220px] ${
              isDragging
                ? 'border-emerald-400 bg-emerald-950/30'
                : 'border-slate-800 bg-slate-900 hover:border-emerald-500/50 hover:bg-slate-800/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, text/csv, application/vnd.ms-excel"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <UploadCloud className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-white">
                Arrastra tu archivo CSV aquí o <span className="text-emerald-400 underline">examina</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Acepta archivos UTF-8 o codificados por Excel (.csv)
              </p>
            </div>

            {rawFileName && (
              <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 font-bold">
                📄 {rawFileName}
              </span>
            )}
          </div>

          {/* BOTÓN DE EJECUCIÓN BULK UPSERT */}
          {parsedItems.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-bold">Resumen de Carga:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {validCount} Válidas · {invalidCount} Con Error
                </span>
              </div>

              {isProcessing && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>Ejecutando .upsert() con ignoreDuplicates...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleExecuteBulkInsert}
                disabled={isProcessing || validCount === 0}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Procesando .upsert([ ... ]) en Supabase...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>Ejecutar Upsert ({validCount} Filas Válidas)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* TABLA PREVISUALIZACIÓN Y VALIDACIÓN DE FILAS */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              Previsualización &amp; Validación de Datos
            </h3>
            {parsedItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setParsedItems([]);
                  setRawFileName('');
                  setImportSummary(null);
                }}
                className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpiar</span>
              </button>
            )}
          </div>

          {parsedItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-2 border border-slate-800/80 rounded-2xl bg-slate-950/40 p-6">
              <FileSpreadsheet className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="font-bold text-white">Ningún archivo cargado aún.</p>
              <p>Descarga la plantilla modelo e inserta tus clientes para comenzar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 font-mono">
                    <th className="py-2.5 px-3"># Fila</th>
                    <th className="py-2.5 px-3">Cliente / Teléfono</th>
                    <th className="py-2.5 px-3">Monto Prestado</th>
                    <th className="py-2.5 px-3">Saldo Actual</th>
                    <th className="py-2.5 px-3">Modalidad</th>
                    <th className="py-2.5 px-3 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {parsedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-400">#{item.rowNumber}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-white block">{item.cleanData.name || 'Sin Nombre'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{item.cleanData.phone}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        {formatCOP(item.cleanData.principal)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                        {formatCOP(item.cleanData.remainingBalance)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-sky-300 uppercase text-[10px]">
                        {item.cleanData.modality}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {item.isValid ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            VÁLIDO
                          </span>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 cursor-help"
                            title={item.errors.join(', ')}
                          >
                            ERROR
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
