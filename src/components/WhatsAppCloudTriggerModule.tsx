import React, { useState, useEffect, useMemo } from 'react';
import {
  MessageCircle,
  Zap,
  Database,
  Code2,
  CheckCircle2,
  Send,
  Smartphone,
  Copy,
  Check,
  Terminal,
  ExternalLink,
  Search,
  Clock,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { ClientProfile, LedgerEntry, LoanDetail } from '../data/mockData';
import { formatCOP, roundCOP } from '../utils/financialCalculations';
import {
  WhatsAppTriggerDispatchLog,
  getStoredWhatsAppTriggerLogs,
  invokeWhatsAppEdgeFunctionTrigger,
} from '../utils/whatsappCloudTriggerService';

interface WhatsAppCloudTriggerModuleProps {
  clients: ClientProfile[];
  loans: LoanDetail[];
  ledger: LedgerEntry[];
}

const SQL_POSTGRES_TRIGGER_CODE = `-- =============================================================================
-- MÓDULO 4: TRIGGER POSTGRESQL (pg_net) -> SUPABASE EDGE FUNCTION
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.fn_trigger_whatsapp_payment_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_client_phone TEXT;
  v_edge_function_url TEXT := 'https://PROJECT_REF.supabase.co/functions/v1/whatsapp-payment-receipt';
  v_service_role_key TEXT := 'SUPABASE_SERVICE_ROLE_KEY';
BEGIN
  SELECT phone INTO v_client_phone
    FROM public.clients
   WHERE id = NEW.client_id
   LIMIT 1;

  PERFORM net.http_post(
    url := v_edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', TG_TABLE_NAME,
      'record', jsonb_build_object(
        'id', NEW.id,
        'receipt_number', NEW.receipt_number,
        'loan_id', NEW.loan_id,
        'client_id', NEW.client_id,
        'client_name', NEW.client_name,
        'client_phone', COALESCE(v_client_phone, ''),
        'amount', NEW.amount,
        'post_balance', NEW.post_balance,
        'payment_method', NEW.payment_method,
        'timestamp', NEW.timestamp,
        'hash', NEW.hash
      )
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_insert_payment_whatsapp ON public.daily_ledger;
CREATE TRIGGER trg_after_insert_payment_whatsapp
  AFTER INSERT ON public.daily_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trigger_whatsapp_payment_receipt();`;

const EDGE_FUNCTION_DENO_CODE = `// supabase/functions/whatsapp-payment-receipt/index.ts
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(async (req: Request) => {
  const { record } = await req.json();
  const META_TOKEN = Deno.env.get("META_WA_ACCESS_TOKEN")!;
  const PHONE_ID = Deno.env.get("META_WA_PHONE_NUMBER_ID")!;

  const cleanPhone = (record.client_phone || "").replace(/\\D/g, "");
  const toE164 = cleanPhone.startsWith("57") ? cleanPhone : \`57\${cleanPhone}\`;

  const response = await fetch(
    \`https://graph.facebook.com/v20.0/\${PHONE_ID}/messages\`,
    {
      method: "POST",
      headers: {
        "Authorization": \`Bearer \${META_TOKEN}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164,
        type: "template",
        template: {
          name: "comprobante_abono_enruta",
          language: { code: "es_CO" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: record.client_name },
              { type: "text", text: record.receipt_number },
              { type: "text", text: \`$\${Number(record.amount).toLocaleString("es-CO")} COP\` },
              { type: "text", text: \`$\${Number(record.post_balance).toLocaleString("es-CO")} COP\` },
              { type: "text", text: (record.payment_method || "EFECTIVO").toUpperCase() },
              { type: "text", text: (record.hash || "").slice(0, 16) }
            ]
          }]
        }
      }),
    }
  );

  const result = await response.json();
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});`;

export const WhatsAppCloudTriggerModule: React.FC<WhatsAppCloudTriggerModuleProps> = ({
  clients,
  loans,
  ledger,
}) => {
  const [logs, setLogs] = useState<WhatsAppTriggerDispatchLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<WhatsAppTriggerDispatchLog | null>(null);
  const [activeCodeTab, setActiveCodeTab] = useState<'live_simulator' | 'sql_trigger' | 'edge_function'>('live_simulator');
  const [selectedLoanId, setSelectedLoanId] = useState<string>(loans[0]?.id || '');
  const [customPhone, setCustomPhone] = useState<string>('');
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [pipelineStage, setPipelineStage] = useState<0 | 1 | 2 | 3>(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'sql' | 'edge' | 'json' | null>(null);

  useEffect(() => {
    const initialLogs = getStoredWhatsAppTriggerLogs(ledger, clients);
    setLogs(initialLogs);
    if (initialLogs.length > 0 && !selectedLog) {
      setSelectedLog(initialLogs[0]);
    }
  }, [ledger, clients]);

  // Actualizar teléfono sugerido cuando cambia el préstamo seleccionado
  useEffect(() => {
    const loan = loans.find((l) => l.id === selectedLoanId);
    if (loan) {
      const client = clients.find((c) => c.id === loan.clientId);
      if (client?.phone) {
        setCustomPhone(client.phone);
      }
    }
  }, [selectedLoanId, loans, clients]);

  const handleSimulatePostgresTriggerDispatch = async () => {
    const loan = loans.find((l) => l.id === selectedLoanId) || loans[0];
    if (!loan) return;

    const client = clients.find((c) => c.id === loan.clientId);
    const targetPhone = customPhone.trim() || client?.phone || '+57 314 789 2341';
    const amount = roundCOP(loan.installmentAmount || 25000);
    const postBalance = Math.max(0, roundCOP(loan.remainingBalance - amount));

    setIsDispatching(true);
    setPipelineStage(1); // Etapa 1: INSERT INTO public.daily_ledger

    await new Promise((r) => setTimeout(r, 260));
    setPipelineStage(2); // Etapa 2: AFTER INSERT Trigger -> pg_net.http_post()

    await new Promise((r) => setTimeout(r, 280));
    setPipelineStage(3); // Etapa 3: Edge Function -> Meta Graph API v20.0

    const mockEntry: LedgerEntry = {
      id: `led-wa-${Date.now()}`,
      receiptNumber: `REC-${Math.floor(100000 + Math.random() * 900000)}`,
      loanId: loan.id,
      clientId: loan.clientId,
      clientName: loan.clientName,
      routeId: loan.routeId,
      amount,
      principalPortion: roundCOP(amount * 0.8),
      interestPortion: roundCOP(amount * 0.2),
      paymentMethod: 'efectivo',
      preBalance: loan.remainingBalance,
      postBalance,
      timestamp: new Date().toISOString(),
      gpsLocation: '6.25180, -75.61420 (±10m SAT)',
      hash: `sha256-${Date.now().toString(16)}f9a8c3b2`,
    };

    const createdLog = await invokeWhatsAppEdgeFunctionTrigger({
      entry: mockEntry,
      clientPhone: targetPhone,
      triggerSource: 'PG_NET_AFTER_INSERT_TRIGGER',
    });

    const refreshed = getStoredWhatsAppTriggerLogs([mockEntry, ...ledger], clients);
    setLogs(refreshed);
    setSelectedLog(createdLog);
    setIsDispatching(false);
  };

  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.clientName.toLowerCase().includes(q) ||
        l.receiptNumber.toLowerCase().includes(q) ||
        l.recipientPhoneE164.includes(q) ||
        l.wamid.toLowerCase().includes(q)
    );
  }, [logs, searchTerm]);

  const handleCopyText = (text: string, type: 'sql' | 'edge' | 'json') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* CABECERA PRINCIPAL DEL MÓDULO 4 */}
      <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" />
                Módulo 4 · WhatsApp Automático (Edge Functions + Triggers)
              </span>
              <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-mono bg-slate-950 text-slate-300 border border-slate-800">
                Meta Graph API v20.0 · pg_net
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Despacho Automatizado de Comprobantes vía Meta Cloud API
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              Un Trigger en PostgreSQL (<code className="text-emerald-300 font-mono">AFTER INSERT ON public.daily_ledger</code>)
              detecta cada nuevo abono e invoca asíncronamente mediante{' '}
              <code className="text-emerald-300 font-mono">pg_net</code> la Edge Function{' '}
              <code className="text-emerald-300 font-mono">whatsapp-payment-receipt</code> para entregar el recibo oficial al celular del deudor.
            </p>
          </div>

          {/* SELECTOR DE VISTA TÉCNICA */}
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setActiveCodeTab('live_simulator')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeCodeTab === 'live_simulator'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Monitor & Simulador</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCodeTab('sql_trigger')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeCodeTab === 'sql_trigger'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Trigger SQL (pg_net)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCodeTab('edge_function')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeCodeTab === 'edge_function'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Edge Function (Deno)</span>
            </button>
          </div>
        </div>

        {/* PIPELINE DE ARQUITECTURA EN 3 ETAPAS */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              pipelineStage >= 1
                ? 'bg-emerald-950/40 border-emerald-500/60'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[11px] flex items-center justify-center">
                  1
                </span>
                INSERT en Postgres
              </span>
              <Database className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              public.daily_ledger &rarr; trg_after_insert_payment_whatsapp
            </p>
          </div>

          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              pipelineStage >= 2
                ? 'bg-emerald-950/40 border-emerald-500/60'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[11px] flex items-center justify-center">
                  2
                </span>
                Supabase Edge Function
              </span>
              <Terminal className="w-4 h-4 text-sky-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              net.http_post() &rarr; /functions/v1/whatsapp-payment-receipt
            </p>
          </div>

          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              pipelineStage >= 3
                ? 'bg-emerald-950/40 border-emerald-500/60'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[11px] flex items-center justify-center">
                  3
                </span>
                Meta WhatsApp Cloud API
              </span>
              <MessageCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              POST graph.facebook.com/v20.0/&#123;PHONE_ID&#125;/messages
            </p>
          </div>
        </div>
      </div>

      {/* PESTAÑA 2: CÓDIGO SQL DEL TRIGGER POSTGRES */}
      {activeCodeTab === 'sql_trigger' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                Migración SQL: Trigger PostgreSQL con pg_net (Archivo: 20261028000004_whatsapp_auto_receipt_trigger.sql)
              </h3>
              <p className="text-xs text-slate-400">
                Ejecuta este bloque en el SQL Editor de Supabase para activar el disparo automático en la base de datos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopyText(SQL_POSTGRES_TRIGGER_CODE, 'sql')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              {copiedType === 'sql' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedType === 'sql' ? 'SQL Copiado' : 'Copiar Trigger SQL'}</span>
            </button>
          </div>
          <pre className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
            {SQL_POSTGRES_TRIGGER_CODE}
          </pre>
        </div>
      )}

      {/* PESTAÑA 3: CÓDIGO DENO DE LA EDGE FUNCTION */}
      {activeCodeTab === 'edge_function' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Code2 className="w-4 h-4 text-sky-400" />
                Supabase Edge Function: supabase/functions/whatsapp-payment-receipt/index.ts
              </h3>
              <p className="text-xs text-slate-400">
                Conecta con Meta Cloud API usando los secretos META_WA_ACCESS_TOKEN y META_WA_PHONE_NUMBER_ID.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopyText(EDGE_FUNCTION_DENO_CODE, 'edge')}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              {copiedType === 'edge' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedType === 'edge' ? 'Código Copiado' : 'Copiar Edge Function'}</span>
            </button>
          </div>
          <pre className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-sky-300 overflow-x-auto leading-relaxed">
            {EDGE_FUNCTION_DENO_CODE}
          </pre>
        </div>
      )}

      {/* PESTAÑA 1: SIMULADOR DE DISPARO EN VIVO + VISTA PREVIA DEL DEUDOR + PAYLOAD META */}
      {activeCodeTab === 'live_simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* COLUMNA IZQUIERDA (7 COLS): DISPARADOR DEL TRIGGER + PAYLOAD JSON META CLOUD API */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  Disparador de Prueba (Trigger Postgres &rarr; Edge Function)
                </h3>
                <span className="text-[11px] font-mono text-emerald-400">
                  Template: comprobante_abono_enruta (es_CO)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Seleccionar Deudor / Préstamo
                  </label>
                  <select
                    value={selectedLoanId}
                    onChange={(e) => setSelectedLoanId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
                  >
                    {loans.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.clientName} · Cuota {formatCOP(l.installmentAmount)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    WhatsApp Destino (Formato E.164 Colombia)
                  </label>
                  <input
                    type="text"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(e.target.value)}
                    placeholder="+57 314 789 2341"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSimulatePostgresTriggerDispatch}
                disabled={isDispatching}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isDispatching ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Ejecutando Trigger SQL &rarr; Edge Function &rarr; Meta API...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Simular INSERT de Abono y Disparar Comprobante WhatsApp</span>
                  </>
                )}
              </button>
            </div>

            {/* INSPECTOR DEL PAYLOAD ENVIADO A GRAPH.FACEBOOK.COM */}
            {selectedLog && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-sky-400 font-bold block">
                      Payload HTTP POST Enviado por la Edge Function
                    </span>
                    <h4 className="text-xs font-bold text-white font-mono">
                      POST https://graph.facebook.com/v20.0/PHONE_NUMBER_ID/messages
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(JSON.stringify(selectedLog.metaPayload, null, 2), 'json')
                    }
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedType === 'json' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedType === 'json' ? 'Copiado' : 'Copiar JSON'}</span>
                  </button>
                </div>

                <pre className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-[11px] font-mono text-emerald-300 overflow-x-auto">
                  {JSON.stringify(selectedLog.metaPayload, null, 2)}
                </pre>

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                  <span>WAMID: {selectedLog.wamid}</span>
                  <span className="text-emerald-400">Latencia: {selectedLog.latencyMs} ms</span>
                </div>
              </div>
            )}
          </div>

          {/* COLUMNA DERECHA (5 COLS): PREVISUALIZACIÓN DEL CELULAR DEL DEUDOR */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Teléfono del Deudor (Recepción en Vivo)
                </span>
              </div>
              {selectedLog && (
                <a
                  href={`https://api.whatsapp.com/send?phone=${selectedLog.recipientPhoneE164}&text=${encodeURIComponent(
                    selectedLog.renderedMessagePreview
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1"
                >
                  <span>Abrir WhatsApp Real</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {selectedLog ? (
              <div className="bg-[#0b141a] border border-slate-800 rounded-2xl p-4 space-y-3 shadow-inner">
                {/* Cabecera de conversación WhatsApp */}
                <div className="flex items-center justify-between bg-[#202c33] px-3.5 py-2.5 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-black text-xs">
                      ER
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white flex items-center gap-1">
                        EnRuta Pagos Oficial
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      </span>
                      <span className="text-[10px] text-slate-300 font-mono">
                        +{selectedLog.recipientPhoneE164} · Cuenta de Empresa
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">Meta API</span>
                </div>

                {/* Burbuja de Mensaje Recibido */}
                <div className="bg-[#005c4b] text-slate-100 rounded-2xl rounded-tl-none p-3.5 text-xs space-y-1.5 shadow-md">
                  <div className="font-bold text-emerald-200 flex items-center justify-between">
                    <span>🧾 COMPROBANTE DIGITAL DE ABONO</span>
                    <span className="text-[10px] font-mono opacity-80">
                      #{selectedLog.receiptNumber}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-white">
                    Hola <strong>{selectedLog.clientName}</strong>, hemos registrado exitosamente tu
                    abono en el sistema central:
                  </p>
                  <div className="bg-black/25 rounded-xl p-2.5 font-mono text-[11px] space-y-1">
                    <div>
                      • Valor Abonado:{' '}
                      <strong className="text-emerald-300">
                        {formatCOP(selectedLog.amount)}
                      </strong>
                    </div>
                    <div>
                      • Nuevo Saldo Pendiente:{' '}
                      <strong className="text-amber-300">
                        {formatCOP(selectedLog.remainingBalance)}
                      </strong>
                    </div>
                    <div>• Medio: {selectedLog.paymentMethod.toUpperCase()}</div>
                    <div className="text-[10px] text-slate-300 truncate">
                      • Sello SHA-256: {selectedLog.wamid.slice(-14)}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200 pt-1">
                    <span>
                      {new Date(selectedLog.timestamp).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <CheckCircle2 className="w-3 h-3 text-sky-300" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-xs text-slate-400">
                Selecciona un envío de la bitácora para previsualizar el comprobante.
              </div>
            )}

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Trigger: trg_after_insert_payment_whatsapp</span>
              <span className="text-emerald-400 font-bold">Activo 24/7</span>
            </div>
          </div>
        </div>
      )}

      {/* TABLA DE AUDITORÍA DE COMPROBANTES WHATSAPP DESPACHADOS */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Bitácora de Comprobantes Despachados (`public.whatsapp_receipt_logs`)
            </h3>
            <p className="text-xs text-slate-400">
              Historial de ejecuciones del Trigger en Postgres hacia la Edge Function de Meta WhatsApp Cloud API.
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar deudor, recibo o WAMID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                <th className="py-3 px-3">Recibo / Hora</th>
                <th className="py-3 px-3">Deudor</th>
                <th className="py-3 px-3">Teléfono E.164</th>
                <th className="py-3 px-3">Abono / Nuevo Saldo</th>
                <th className="py-3 px-3">Origen Disparo</th>
                <th className="py-3 px-3">Meta WAMID</th>
                <th className="py-3 px-3 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filteredLogs.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedLog(item)}
                  className={`transition-colors cursor-pointer ${
                    selectedLog?.id === item.id ? 'bg-emerald-950/30' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <td className="py-3 px-3 font-mono">
                    <span className="font-bold text-white block">{item.receiptNumber}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.timestamp).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-bold text-white">{item.clientName}</td>
                  <td className="py-3 px-3 font-mono text-emerald-300">
                    +{item.recipientPhoneE164}
                  </td>
                  <td className="py-3 px-3 font-mono">
                    <span className="text-emerald-400 font-bold">{formatCOP(item.amount)}</span>
                    <span className="text-slate-500 mx-1">&rarr;</span>
                    <span className="text-slate-300">{formatCOP(item.remainingBalance)}</span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-sky-300">
                    {item.triggerSource}
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-slate-400 truncate max-w-[160px]">
                    {item.wamid}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
