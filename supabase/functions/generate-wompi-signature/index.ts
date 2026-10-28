// Supabase Edge Function: generate-wompi-signature
// Calcula en el backend la firma criptográfica SHA-256 requerida por el Widget de Wompi:
// SHA256(referencia + montoEnCentavos + moneda + WOMPI_INTEGRITY_SECRET)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignatureRequestBody {
  reference: string;
  amountInCents: number;
  currency?: 'COP';
  expirationTime?: string;
}

/**
 * Genera el hash SHA-256 en formato hexadecimal usando Web Crypto API nativa de Deno.
 */
async function computeSha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  // Manejo de preflight CORS para llamadas desde supabase.functions.invoke()
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
    const integritySecret = Deno.env.get('WOMPI_INTEGRITY_SECRET');

    if (!integritySecret) {
      console.error('[generate-wompi-signature] Falta WOMPI_INTEGRITY_SECRET en las variables de entorno.');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing integrity secret' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: SignatureRequestBody = await req.json();
    const reference = body?.reference?.trim();
    const amountInCents = Number(body?.amountInCents);
    const currency = body?.currency || 'COP';
    const expirationTime = body?.expirationTime;

    if (!reference || !Number.isInteger(amountInCents) || amountInCents <= 0) {
      return new Response(
        JSON.stringify({
          error: 'Parámetros inválidos: se requiere `reference` y `amountInCents` (entero positivo).',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Regla oficial de Wompi para la firma de integridad:
    // <Referencia><MontoEnCentavos><Moneda>[<FechaExpiracion>]<SecretoIntegridad>
    const rawStringToSign = expirationTime
      ? `${reference}${amountInCents}${currency}${expirationTime}${integritySecret}`
      : `${reference}${amountInCents}${currency}${integritySecret}`;

    const signature = await computeSha256Hex(rawStringToSign);

    return new Response(
      JSON.stringify({
        signature,
        reference,
        amountInCents,
        currency,
        ...(expirationTime ? { expirationTime } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[generate-wompi-signature] Error interno:', err);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: err?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
