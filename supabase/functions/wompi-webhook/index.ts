// Supabase Edge Function: wompi-webhook
// Recibe eventos `transaction.updated` desde Wompi, aplica 3 capas de seguridad antifraude:
// 1. Validación criptográfica SHA-256 (`WOMPI_EVENTS_SECRET`)
// 2. Idempotencia Anti-Replay consultando `payment_receipts` por `wompi_transaction_id`
// 3. Validación estricta de monto estático quemado en código (`amount_in_cents === 14000000`, $140.000 COP)
// Extrae `tenant_id` desde `${tenant_id}-${Date.now()}`, activa `tenant_subscriptions` e inserta el recibo en `payment_receipts`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-event-checksum',
};

// Precio estático quemado en el código del servidor: $140.000 COP = 14000000 centavos
const FIXED_EXPECTED_AMOUNT_CENTS = 14000000;
const FIXED_CURRENCY = 'COP';

interface WompiWebhookPayload {
  event: string;
  data: {
    transaction: {
      id: string;
      amount_in_cents: number;
      reference: string;
      customer_email: string;
      currency: string;
      payment_method_type: string;
      status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
      status_message?: string;
    };
  };
  environment: 'prod' | 'test';
  signature: {
    properties: string[];
    checksum: string;
  };
  timestamp: number;
  sent_at: string;
}

/**
 * Resuelve dinámicamente una propiedad anidada dentro de `data`
 * según la lista `signature.properties` enviada por Wompi.
 */
function getNestedProperty(obj: Record<string, any>, path: string): string {
  const value = path
    .split('.')
    .reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : ''), obj);
  return String(value ?? '');
}

/**
 * Calcula el hash SHA-256 en formato hexadecimal usando Web Crypto API nativa de Deno.
 */
async function computeSha256Hex(rawString: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Comparación en tiempo constante para mitigar ataques de timing sobre el checksum.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (cleanA.length !== cleanB.length) return false;
  let mismatch = 0;
  for (let i = 0; i < cleanA.length; i++) {
    mismatch |= cleanA.charCodeAt(i) ^ cleanB.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Extrae el `tenant_id` desde la referencia de pago enviada a Wompi.
 * Formato estricto de trazabilidad: `${tenant_id}-${Date.now()}`
 * Soporta tanto IDs simples como UUIDs con guiones separando el timestamp final.
 */
function extractTenantIdFromReference(reference: string): string | null {
  if (!reference) return null;
  const trimmed = reference.trim();

  const lastDashIndex = trimmed.lastIndexOf('-');
  if (lastDashIndex > 0) {
    return trimmed.slice(0, lastDashIndex);
  }

  // Fallback legacy `SUB_<tenant_id>_<timestamp>`
  const parts = trimmed.split('_');
  if (parts.length >= 3 && parts[0] === 'SUB') {
    return parts[1];
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const eventsSecret = Deno.env.get('WOMPI_EVENTS_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!eventsSecret || !supabaseUrl || !supabaseServiceRoleKey) {
      console.error('[wompi-webhook] Faltan variables de entorno requeridas.');
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration: missing secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: WompiWebhookPayload = await req.json();

    // 1. Validación estructural mínima del evento
    if (
      !payload ||
      !payload.signature ||
      !Array.isArray(payload.signature.properties) ||
      !payload.signature.checksum ||
      !payload.data?.transaction
    ) {
      return new Response(JSON.stringify({ error: 'Invalid webhook payload structure' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Validación Criptográfica de Integridad del Evento (Wompi Checksum)
    const concatenatedProperties = payload.signature.properties
      .map((propPath) => getNestedProperty(payload.data, propPath))
      .join('');

    const stringToHash = `${concatenatedProperties}${payload.timestamp}${eventsSecret}`;
    const calculatedChecksum = await computeSha256Hex(stringToHash);
    const headerChecksum = req.headers.get('x-event-checksum') || payload.signature.checksum;

    const isSignatureValid =
      timingSafeEqualHex(calculatedChecksum, payload.signature.checksum) &&
      timingSafeEqualHex(calculatedChecksum, headerChecksum);

    if (!isSignatureValid) {
      console.warn('[wompi-webhook] Firma criptográfica inválida rechazada.', {
        reference: payload.data.transaction.reference,
      });
      return new Response(JSON.stringify({ error: 'Invalid cryptographic signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Procesar únicamente el evento `transaction.updated`
    if (payload.event !== 'transaction.updated') {
      return new Response(
        JSON.stringify({ received: true, ignoredEvent: payload.event }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transaction = payload.data.transaction;

    // Cliente Supabase con Service Role (único autorizado para INSERT/UPDATE bajo RLS de solo lectura)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // =========================================================================
    // CAPA DE SEGURIDAD 1: IDEMPOTENCIA ANTI-REPLAY
    // Consulta `payment_receipts` buscando `wompi_transaction_id`. Si ya existe,
    // retorna HTTP 200 y aborta para evitar activaciones o recibos duplicados.
    // =========================================================================
    const { data: existingReceipt, error: idempotencyError } = await supabaseAdmin
      .from('payment_receipts')
      .select('id, wompi_transaction_id, status')
      .eq('wompi_transaction_id', transaction.id)
      .maybeSingle();

    if (idempotencyError) {
      console.error('[wompi-webhook] Error verificando idempotencia:', idempotencyError);
      return new Response(
        JSON.stringify({ error: 'Idempotency check failed', details: idempotencyError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingReceipt) {
      console.info(
        `[wompi-webhook] Replay detectado: la transacción ${transaction.id} ya fue procesada (Receipt ID: ${existingReceipt.id}). Abortando de forma idempotente.`
      );
      return new Response(
        JSON.stringify({
          received: true,
          idempotentDuplicate: true,
          transactionId: transaction.id,
          receiptId: existingReceipt.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Procesamiento de transacciones APROBADAS
    if (transaction.status === 'APPROVED') {
      // =======================================================================
      // CAPA DE SEGURIDAD 2: VALIDACIÓN ESTRICTA DE MONTO ESTÁTICO (14000000)
      // Rechaza el pago si `amount_in_cents` no coincide con $140.000 COP.
      // =======================================================================
      const receivedAmountCents = Number(transaction.amount_in_cents || 0);

      if (
        transaction.currency !== FIXED_CURRENCY ||
        receivedAmountCents !== FIXED_EXPECTED_AMOUNT_CENTS
      ) {
        console.error('[wompi-webhook] Alerta de fraude: monto o moneda inválida.', {
          transactionId: transaction.id,
          reference: transaction.reference,
          receivedAmountCents,
          expectedAmountInCents: FIXED_EXPECTED_AMOUNT_CENTS,
          currency: transaction.currency,
        });
        return new Response(
          JSON.stringify({
            error: 'Fraud prevention: transaction amount does not match required subscription fee (14000000 cents)',
            receivedAmountCents,
            expectedAmountInCents: FIXED_EXPECTED_AMOUNT_CENTS,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =======================================================================
      // TRAZABILIDAD: Extracción del `tenant_id` desde `${tenant_id}-${Date.now()}`
      // =======================================================================
      const tenantId = extractTenantIdFromReference(transaction.reference);

      if (!tenantId) {
        console.error(
          '[wompi-webhook] No fue posible extraer tenant_id de la referencia:',
          transaction.reference
        );
        return new Response(
          JSON.stringify({
            error: 'Invalid reference format: expected ${tenant_id}-${timestamp}',
            reference: transaction.reference,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const amountCOP = Math.round(receivedAmountCents / 100); // 140000 COP

      // 4.1 UPSERT / UPDATE en `tenant_subscriptions` usando el `tenant_id` exacto extraído de la referencia
      const subscriptionPayload = {
        tenant_id: tenantId,
        status: 'active',
        wompi_transaction_id: transaction.id,
        last_payment_reference: transaction.reference,
        last_payment_amount_cents: receivedAmountCents,
        payment_method_type: transaction.payment_method_type,
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: updatedRows, error: dbError } = await supabaseAdmin
        .from('tenant_subscriptions')
        .upsert(subscriptionPayload, { onConflict: 'tenant_id' })
        .select();

      if (dbError) {
        console.error('[wompi-webhook] Error actualizando tenant_subscriptions:', dbError);
        return new Response(
          JSON.stringify({ error: 'Database update failed', details: dbError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4.2 INSERT inmutable en `payment_receipts` usando el mismo `tenant_id`
      const { data: insertedReceipt, error: receiptError } = await supabaseAdmin
        .from('payment_receipts')
        .insert({
          tenant_id: tenantId,
          amount: amountCOP,
          reference: transaction.reference,
          wompi_transaction_id: transaction.id,
          status: transaction.status,
        })
        .select()
        .single();

      if (receiptError) {
        console.error('[wompi-webhook] Error insertando en payment_receipts:', receiptError);
        return new Response(
          JSON.stringify({
            error: 'Receipt insertion failed',
            details: receiptError.message,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: 'active',
          tenantId,
          transactionId: transaction.id,
          updatedCount: updatedRows?.length ?? 0,
          receiptId: insertedReceipt?.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transacciones en otro estado (DECLINED, VOIDED, ERROR) se acusan como recibidas (HTTP 200)
    return new Response(
      JSON.stringify({
        success: true,
        transactionId: transaction.id,
        transactionStatus: transaction.status,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[wompi-webhook] Excepción no controlada:', err);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: err?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
