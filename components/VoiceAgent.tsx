"use client";
// VoiceAgent.tsx – improved: ensures first assistant sentence is not clipped
//---------------------------------------------------------------------
import React, { useRef, useState } from "react";

interface CallResponse {
  callId: string;
  websocketUrl: string;
  error?: string;
}

const SAMPLE_RATE_TX = 16000;

const VoiceAgent: React.FC = () => {
  /* ───── React state ───── */
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ───── refs for long‑lived objects ───── */
  const wsRef = useRef<WebSocket | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const workletLoadedRef = useRef(false);

  /* ───── helpers ───── */
  const floatTo16LE = (input: Float32Array) => {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out.buffer;
  };

  const playPcmChunk = (buf: ArrayBuffer) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    /* convert Int16 → Float32 [-1..1] */
    const int16 = new Int16Array(buf);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

    /* wrap in AudioBuffer */
    const audioBuf = ctx.createBuffer(1, float32.length, SAMPLE_RATE_TX);
    audioBuf.getChannelData(0).set(float32);

    /* create one‑shot source */
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);

    /* queue play time – start immediately for very first chunk */
    if (nextPlayTimeRef.current < ctx.currentTime) {
      nextPlayTimeRef.current = ctx.currentTime;
    }

    src.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuf.duration;
  };

  /* ───── mic capture / encoder ───── */
  const startMicCapture = async (socket: WebSocket) => {
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: 48000 });
      await ctx.resume();
      audioCtxRef.current = ctx;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const recorderWorklet = `class PCMProcessor extends AudioWorkletProcessor {
      constructor(){ super(); this._buf=[]; }
      process(inputs){
        if(!inputs[0][0]) return true;
        this._buf.push(new Float32Array(inputs[0][0]));
        if(this._buf.length>=12){
          const merged=new Float32Array(this._buf.length*128);
          this._buf.forEach((c,i)=>merged.set(c,i*128));
          this._buf=[];
          const down=new Float32Array(merged.length/3);
          for(let i=0;i<down.length;i++){
            const idx=i*3; const i1=idx|0; const frac=idx-i1;
            down[i]=merged[i1]*(1-frac)+merged[Math.min(i1+1,merged.length-1)]*frac;
          }
          this.port.postMessage(down);
        }
        return true;
      }
    };
    registerProcessor('pcm-processor',PCMProcessor);`;

    if (!workletLoadedRef.current) {
      const blobURL = URL.createObjectURL(new Blob([recorderWorklet], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(blobURL);
      workletLoadedRef.current = true;
    }

    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'pcm-processor');
    workletNodeRef.current = node;

    node.port.onmessage = (e) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(floatTo16LE(e.data as Float32Array));
      }
    };

    src.connect(node);
  };

  const stopMicCapture = () => {
    workletNodeRef.current?.disconnect();
    audioCtxRef.current?.close();
    workletNodeRef.current = null;
    audioCtxRef.current = null;
    nextPlayTimeRef.current = 0;
  };

  const toggleCall = async () => {
    if (isConnected) {
      wsRef.current?.close();
      stopMicCapture();
      setIsConnected(false);
      return;
    }
    try {
      setIsConnecting(true);
      setError(null);

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext({ sampleRate: 48000 });
        await audioCtxRef.current.resume();
      }

      const res = await fetch('/api/create-call', { method: 'POST' });
      const data = (await res.json()) as CallResponse;
      if (data.error) throw new Error(data.error);

      const socket = new WebSocket(data.websocketUrl);
      wsRef.current = socket;
      socket.binaryType = 'arraybuffer';

      socket.onopen = async () => {
        await startMicCapture(socket);
        setIsConnected(true);
        setIsConnecting(false);
      };

      socket.onmessage = (evt) => {
        if (typeof evt.data === 'string') {
          console.log('CTRL:', JSON.parse(evt.data));
        } else {
          playPcmChunk(evt.data);
        }
      };

      socket.onerror = (e) => {
        console.error(e);
        setError('WebSocket error');
      };

      socket.onclose = () => {
        stopMicCapture();
        setIsConnected(false);
        setIsConnecting(false);
      };
    } catch (e: any) {
      setError(e.message || 'Failed to create call');
      setIsConnecting(false);
    }
  };

  const btnText = isConnecting ? 'Connecting…' : isConnected ? 'End Call' : 'Start Call';

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-white to-cyan-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white/60 backdrop-blur-xl shadow-2xl rounded-3xl px-8 py-10 text-center border border-gray-200">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 tracking-tight mb-6">Talk to Agent</h1>
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">{error}</div>
        )}
        <button
          onClick={toggleCall}
          disabled={isConnecting}
          className={`w-full py-3 text-lg font-medium rounded-xl transition duration-300 ease-in-out shadow-md ${
            isConnected ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
          } text-white disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {btnText}
        </button>
      </div>
    </div>
  );
};

export default VoiceAgent;
