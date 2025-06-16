// app/api/vapi-token/route.ts
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const apiKey = process.env.VAPI_API_KEY;           // Your Vapi public key
  const assistantId = process.env.VAPI_ASSISTANT_ID; // Your assistant UUID

  if (!apiKey || !assistantId) {
    return new Response(
      JSON.stringify({ error: 'Missing Vapi environment variables' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ apiKey, assistantId }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
