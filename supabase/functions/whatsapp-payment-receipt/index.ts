// Supabase Edge Function: whatsapp-payment-receipt
// Invocada automáticamente por el Trigger PostgreSQL (pg_net) tras cada INSERT en public.daily_ledger
// Envía el comprobante digital de abono al deudor mediante Meta WhatsApp Cloud API (Graph API v20.0)

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface TriggerWebhookPayload {
  type?: 'INSERT';
  table?: string;
  schema?: string;
  record: {
    id: string;
    receipt_number: string;
    loan_id: string;
    client_id: string;
    client_name: string;
    client_phone?: string;
    route_id?: string;
    amount: number;
    principal_portion?: number;
    interest_portion?: number;
    payment_method?: string;
    pre_balance?: number;
    post_balance: number;
    timestamp?: string;
    hash?: string;
  };
}

function normalizeColombianE164(rawPhone: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('57') && digits.length >= 12) return digits;
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}

function formatCOPServer(amount: number): string {
  return `$${Math.round(Number(amount) || 0).toLocaleString('es-CO')} COP`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: TriggerWebhookPayload = await req.json();
    const record = payload.record || (payload as unknown as TriggerWebhookPayload['record']);

    if (!record || !record.id) {
      return new Response(
        JSON.stringify({ error: 'Payload inválido: se requiere el objeto record del abono.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const metaAccessToken = Deno.env.get('META_WA_ACCESS_TOKEN') ?? '';
    const metaPhoneNumberId = Deno.env.get('META_WA_PHONE_NUMBER_ID') ?? '';
    const metaApiVersion = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v20.0';
    const metaTemplateName = Deno.env.get('META_WA_TEMPLATE_NAME') ?? 'comprobante_abono_enruta';

    const supabaseAdmin =
      supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

    // 1. Resolver el teléfono del deudor si no viene embebido en el payload del Trigger
    let rawPhone = record.client_phone || '';
    if (!rawPhone && supabaseAdmin && record.client_id) {
      const { data: clientRow } = await supabaseAdmin
        .from('clients')
        .select('phone, name')
        .eq('id', record.client_id)
        .maybeSingle();

      if (clientRow?.phone) {
        rawPhone = clientRow.phone;
      }
    }

    const recipientE164 = normalizeColombianE164(rawPhone);
    if (!recipientE164) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `El deudor (${record.client_name}) no posee un número móvil E.164 válido.`,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const amountFormatted = formatCOPServer(record.amount);
    const postBalanceFormatted = formatCOPServer(record.post_balance);
    const shortHash = (record.hash || `sha256-${record.id}`).slice(0, 16);

    // 2. Construir el payload oficial para Meta WhatsApp Cloud API
    const metaEndpoint = `https://graph.facebook.com/${metaApiVersion}/${metaPhoneNumberId}/messages`;

    const metaCloudPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientE164,
      type: 'template',
      template: {
        name: metaTemplateName,
        language: { code: 'es_CO' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: record.client_name || 'Cliente EnRuta' },
              { type: 'text', text: record.receipt_number || record.id },
              { type: 'text', text: amountFormatted },
              { type: 'text', text: postBalanceFormatted },
              { type: 'text', text: (record.payment_method || 'EFECTIVO').toUpperCase() },
              { type: 'text', text: shortHash },
            ],
          },
        ],
      },
    };

    let deliveryStatus: 'DELIVERED_META_API' | 'SANDBOX_SIMULATED' | 'FAILED' = 'SANDBOX_SIMULATED';
    let wamid = `wamid.HBgM${recipientE164}FQIAERgS${Date.now()}`;
    let metaResponseJson: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      contacts: [{ input: recipientE164, wa_id: recipientE164 }],
      messages: [{ id: wamid }],
    };

    // 3. Si las credenciales de Meta Cloud API están configuradas en Supabase Secrets, disparar petición real
    if (metaAccessToken && metaPhoneNumberId) {
      const metaRes = await fetch(metaEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${metaAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metaCloudPayload),
      });

      metaResponseJson = await metaRes.json().catch(() => ({}));

      if (metaRes.ok) {
        deliveryStatus = 'DELIVERED_META_API';
        const messagesArr = (metaResponseJson as any)?.messages;
        if (Array.isArray(messagesArr) && messagesArr[0]?.id) {
          wamid = messagesArr[0].id;
        }
      } else {
        deliveryStatus = 'FAILED';
      }
    }

    // 4. Registrar auditoría del despacho en public.whatsapp_receipt_logs
    if (supabaseAdmin) {
      await supabaseAdmin.from('whatsapp_receipt_logs').insert([
        {
          ledger_id: record.id,
          receipt_number: record.receipt_number,
          loan_id: record.loan_id,
          client_id: record.client_id,
          client_name: record.client_name,
          recipient_phone: recipientE164,
          amount: record.amount,
          remaining_balance: record.post_balance,
          wamid,
          status: deliveryStatus,
          meta_payload: metaCloudPayload,
          meta_response: metaResponseJson,
        },
      ]);
    }

    return new Response(
      JSON.stringify({
        success: deliveryStatus !== 'FAILED',
        status: deliveryStatus,
        wamid,
        recipient: recipientE164,
        receiptNumber: record.receipt_number,
        metaPayload: metaCloudPayload,
        metaResponse: metaResponseJson,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Error interno en Edge Function whatsapp-payment-receipt',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
