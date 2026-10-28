// Supabase Edge Function: wompi-signature
// Genera de forma segura la firma de integridad SHA-256 exigida por el Widget de Wompi
// concatenando: referencia + montoEnCentavos + moneda + WOMPI_INTEGRITY_SECRET

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignatureRequestPayload {
  tenantId: string;
  reference: string;
  amountInCents: number;
  currency: 'COP';
  expirationTime?: string;
}

async function generateSha256Hex(rawText: string): Promise<string> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(rawText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const integritySecret = Deno.env.get('WOMPI_INTEGRITY_SECRET');
    if (!integritySecret) {
      return new Response(
        JSON.stringify({ error: 'Falta configurar WOMPI_INTEGRITY_SECRET en el servidor.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: SignatureRequestPayload = await req.json();
    const { reference, amountInCents, currency = 'COP', expirationTime } = body;

    if (!reference || !amountInCents || amountInCents <= 0) {
      return new Response(
        JSON.stringify({ error: 'Parámetros de transacción inválidos (reference / amountInCents).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Concatenación estricta exigida por Wompi:
    // <Referencia><MontoEnCentavos><Moneda>[<FechaExpiracion>]<SecretoIntegridad>
    const rawConcatenation = expirationTime
      ? `${reference}${amountInCents}${currency}${expirationTime}${integritySecret}`
      : `${reference}${amountInCents}${currency}${integritySecret}`;

    const integritySignature = await generateSha256Hex(rawConcatenation);

    return new Response(
      JSON.stringify({
        reference,
        amountInCents,
        currency,
        ...(expirationTime ? { expirationTime } : {}),
        integritySignature,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Error interno firmando la transacción', details: err?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
