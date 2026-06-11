"use client";
/**
 * Project 4: VoiceCore — Voice Assistant Frontend
 * Masimbonge Portfolio
 * Edit: WS_URL, colours, and UI text below
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ← Edit: set to your backend URL in production
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/voice";

type Status = "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "error";

interface Message {
  role: "user" | "assistant";
  text: string;
  language?: string;
}

export default function VoiceCorePage() {
  const [status, setStatus]     = useState<Status>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [statusText, setStatusText] = useState("Hold to speak");
  const [visualLevel, setVisualLevel] = useState(0);

  const wsRef         = useRef<WebSocket | null>(null);
  const mediaRef      = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const animFrameRef  = useRef<number>(0);
  const bottomRef     = useRef<HTMLDivElement>(null);

  // ── WebSocket connection ───────────────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => console.log("WS connected");
    ws.onerror = () => setStatus("error");

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "status") {
        setStatusText(msg.text);
      } else if (msg.type === "transcription") {
        setMessages(prev => [...prev, { role: "user", text: msg.text, language: msg.language }]);
        setStatus("thinking");
        setStatusText("Thinking...");
      } else if (msg.type === "response_text") {
        setMessages(prev => [...prev, { role: "assistant", text: msg.text }]);
      } else if (msg.type === "audio_response") {
        // Play the returned audio
        const bytes = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0));
        const blob  = new Blob([bytes], { type: msg.mime });
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        setStatus("speaking");
        setStatusText("Speaking...");
        audio.onended = () => {
          setStatus("idle");
          setStatusText("Hold to speak");
          URL.revokeObjectURL(url);
        };
        audio.play();
      } else if (msg.type === "error") {
        setStatus("error");
        setStatusText(msg.text);
        setTimeout(() => { setStatus("idle"); setStatusText("Hold to speak"); }, 2000);
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Waveform visualiser ────────────────────────────────────────────────────
  const startVisualiser = (stream: MediaStream) => {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    src.connect(analyser);
    analyserRef.current = analyser;

    const tick = () => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setVisualLevel(avg / 128);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const stopVisualiser = () => {
    cancelAnimationFrame(animFrameRef.current);
    setVisualLevel(0);
  };

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (status !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startVisualiser(stream);
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start(100);
      mediaRef.current = recorder;
      setStatus("recording");
      setStatusText("Recording... release to send");
    } catch {
      setStatus("error");
      setStatusText("Microphone access denied");
    }
  }, [status]);

  const stopRecording = useCallback(() => {
    if (status !== "recording" || !mediaRef.current) return;
    stopVisualiser();
    mediaRef.current.stop();
    mediaRef.current.stream.getTracks().forEach(t => t.stop());
    setStatus("transcribing");
    setStatusText("Transcribing...");

    mediaRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(",")[1];
        wsRef.current?.send(JSON.stringify({ type: "audio", data: base64 }));
      };
      reader.readAsDataURL(blob);
    };
  }, [status]);

  // ── Waveform bars ──────────────────────────────────────────────────────────
  const bars = Array.from({ length: 20 }, (_, i) => {
    const h = status === "recording"
      ? Math.max(4, visualLevel * 100 * Math.sin((i / 20) * Math.PI) * (0.5 + Math.random() * 0.5))
      : status === "speaking" ? Math.max(4, 20 * Math.sin((Date.now() / 200 + i) * 0.8))
      : 4;
    return h;
  });

  const statusColour: Record<Status, string> = {
    idle: "#d4ff5c", recording: "#ff6b6b", transcribing: "#4a9eff",
    thinking: "#9b7fff", speaking: "#4ade80", error: "#ff6b6b",
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f0ede8] flex flex-col max-w-2xl mx-auto px-4">

      {/* Header */}
      <header className="py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#d4ff5c] flex items-center justify-center text-black font-bold">V</div>
          <span className="font-bold text-lg">VoiceCore</span>
        </div>
        <button
          onClick={() => { wsRef.current?.send(JSON.stringify({ type: "clear_history" })); setMessages([]); }}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Clear ↺
        </button>
      </header>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20 gap-3">
            <div className="text-5xl">🎤</div>
            <p className="text-white/40 text-sm">Hold the button below and start speaking.<br/>Supports 10 languages — auto-detected.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "bg-[#d4ff5c] text-black font-medium"
                : "bg-white/5 border border-white/10"
            }`}>
              {m.language && m.role === "user" && (
                <p className="text-xs text-black/40 mb-1">Detected: {m.language}</p>
              )}
              {m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Voice control */}
      <div className="py-8 flex flex-col items-center gap-6">

        {/* Waveform */}
        <div className="flex items-center gap-1 h-12">
          {bars.map((h, i) => (
            <div key={i} className="w-1.5 rounded-full transition-all duration-75"
              style={{ height: `${h}px`, background: statusColour[status], opacity: 0.7 + i * 0.015 }} />
          ))}
        </div>

        {/* Hold-to-speak button */}
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
          onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
          disabled={!["idle", "recording"].includes(status)}
          className="w-20 h-20 rounded-full flex items-center justify-center text-2xl transition-all select-none"
          style={{
            background: status === "recording" ? "#ff6b6b" : statusColour[status],
            transform: status === "recording" ? "scale(1.1)" : "scale(1)",
            boxShadow: status === "recording" ? `0 0 30px ${statusColour[status]}60` : "none",
          }}
        >
          {status === "recording" ? "⏹" : status === "speaking" ? "🔊" : status === "thinking" ? "💭" : "🎤"}
        </button>

        <p className="text-sm text-white/40 font-mono">{statusText}</p>
      </div>
    </div>
  );
}
