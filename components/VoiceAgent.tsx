"use client"
import React, { useEffect, useRef, useState } from 'react';
import Vapi from '@vapi-ai/web';            // npm i @vapi-ai/web

interface Creds {
  apiKey: string;
  assistantId: string;
  error?: string;
}

export const VoiceAgent: React.FC = () => {
  /* ---------- local state ------------------------------------------------- */
  const [isLoaded,     setIsLoaded]     = useState(false);   // SDK + creds ready
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected,  setIsConnected]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const vapiRef = useRef<Vapi | null>(null);                 // keeps Vapi instance
  const assistantIdRef = useRef<string | null>(null);        // stores assistantId

  /* ---------- one‑time initialise ---------------------------------------- */
  useEffect(() => {
    const init = async () => {
      try {
        const res  = await fetch('/api/token');
        const data = (await res.json()) as Creds;
        if (data.error) throw new Error(data.error);

        const vapi = new Vapi(data.apiKey);  // <- instantiate SDK
        vapiRef.current      = vapi;
        assistantIdRef.current = data.assistantId;

        /* Global listeners */
        vapi.on('call-start', () => {
          setIsConnected(true);  setIsConnecting(false);
        });
        vapi.on('call-end', () => {
          setIsConnected(false); setIsConnecting(false);
        });
        vapi.on('error', (e: any) => {
          setError(e?.message ?? 'Vapi error');
          setIsConnected(false); setIsConnecting(false);
        });

        setIsLoaded(true);
      } catch (e: any) {
        setError(e?.message ?? 'Could not initialise Vapi');
      }
    };

    init();
  }, []);

  /* ---------- call controls ---------------------------------------------- */
  const toggleCall = async () => {
    const vapi = vapiRef.current;
    if (!vapi || !assistantIdRef.current) return;

    if (isConnected) {
      vapi.stop();                           // ends current call
    } else {
      try {
        setIsConnecting(true);
        await vapi.start(assistantIdRef.current); // begins call
        // call‑start listener flips isConnected
      } catch (e: any) {
        setError(e?.message ?? 'Failed to start call');
        setIsConnecting(false);
      }
    }
  };

  /* ---------- ui helpers -------------------------------------------------- */
  const btnText =
    isConnecting ? 'Connecting…' : isConnected ? 'End Call' : 'Start Call';

  /* ---------- render ------------------------------------------------------ */
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-black mb-8 tracking-wide">
        TALK TO AGENT
      </h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <button
        onClick={toggleCall}
        disabled={!isLoaded || isConnecting}
        className={`px-8 py-4 text-lg font-semibold rounded border-2 transition-colors ${
          isConnected
            ? 'bg-red-500 text-white border-red-500 hover:bg-red-600'
            : 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {btnText}
      </button>

      {!isLoaded && (
        <div className="mt-4 text-gray-600">
          Loading SDK…
        </div>
      )}
    </div>
  );
};

export default VoiceAgent;
