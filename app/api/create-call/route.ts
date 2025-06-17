// app/api/create-call/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  if (!apiKey || !assistantId) {
    return NextResponse.json(
      { error: "Missing VAPI_API_KEY or VAPI_ASSISTANT_ID" },
      { status: 500 }
    );
  }

  try {
    const vapiRes = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistantId:  assistantId ,
        transport: {
          provider: "vapi.websocket",
          audioFormat: {
            format: "pcm_s16le",
            container: "raw",
            sampleRate: 16000,
          },
        },
      }),
    });

    if (!vapiRes.ok) {
      const errJson = await vapiRes.json();
      throw new Error(errJson.error || `HTTP ${vapiRes.status}`);
    }

    const call = await vapiRes.json();
    const wsUrl = call.transport?.websocketCallUrl;

    if (!wsUrl) {
      throw new Error("No websocket URL returned");
    }

    return NextResponse.json({ callId: call.id, websocketUrl: wsUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message },
      { status: 500 }
    );
  }
}
