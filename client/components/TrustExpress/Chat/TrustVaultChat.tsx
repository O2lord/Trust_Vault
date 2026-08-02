"use client";

import Image from "next/image";
import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from "react";
import { ChatAction } from "@/app/api/chat/route";
import ActionCard from "./ActionCard";

// ── Order Picker ──────────────────────────────────────────────────────────────
interface ParsedOrder {
  label: string;
  pda: string;
  rate: string;
  available: string;
}

function parseDisambiguationOrders(text: string): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  const itemRegex = /(?:\d+\.|[•\-])\s+\*\*(Buy Order|Sell Order)\*\*\s+\(([^)]+)\)([\s\S]*?)(?=\n(?:\d+\.|[•\-])\s+\*\*|\n\nPlease|\n\nOnce|\n\nHow|$)/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const rateMatch  = match[3].match(/Rate:\s*([^\n]+)/);
    const availMatch = match[3].match(/Available:\s*([^\n]+)/);
    orders.push({
      label:     match[1],
      pda:       match[2],
      rate:      rateMatch?.[1]?.trim()  ?? "",
      available: availMatch?.[1]?.trim() ?? "",
    });
  }
  return orders;
}

function isDisambiguationMessage(text: string, action: ChatAction | null | undefined): boolean {
  if (action) return false;
  const hasPickPrompt =
    /Please specify which order/i.test(text) ||
    /Could you specify which/i.test(text) ||
    /which (order|one) (do you want|would you like|are you referring)/i.test(text) ||
    /let me know which/i.test(text) ||
    /which (buy|sell) order/i.test(text) ||
    /you have (two|2|multiple|several)/i.test(text);
  return hasPickPrompt && parseDisambiguationOrders(text).length > 1;
}

const ORDER_PICKER_COLORS = {
  buy:  { bg: "#e8f5e9", border: "#22c55e", label: "#166534" },
  sell: { bg: "#fff3e0", border: "#E8480A", label: "#7c2d12" },
} as const;

function OrderPickerCards({ orders, onPick }: { orders: ParsedOrder[]; onPick: (o: ParsedOrder) => void }): JSX.Element {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: BRAND.gray }}>
        Select an order
      </div>
      {orders.map((order) => {
        const isBuy = order.label === "Buy Order";
        const colors = isBuy ? ORDER_PICKER_COLORS.buy : ORDER_PICKER_COLORS.sell;
        const isSelected = picked === order.pda;
        return (
          <button
            key={order.pda}
            onClick={() => { setPicked(order.pda); onPick(order); }}
            style={{
              background: isSelected ? colors.border + "22" : "#fff",
              border: `2px solid ${isSelected ? colors.border : BRAND.border}`,
              borderRadius: 10, padding: "10px 14px",
              cursor: "pointer", textAlign: "left", transition: "all .15s",
              fontFamily: "'Syne', sans-serif",
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = colors.border; }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = BRAND.border; }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: colors.label, background: colors.bg, borderRadius: 4, padding: "2px 7px" }}>
                {order.label}
              </span>
              <span style={{ fontSize: 11, color: BRAND.lightGray, fontWeight: 600 }}>{order.pda}</span>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 2 }}>
              {order.rate      && <span style={{ fontSize: 12, color: BRAND.black, fontWeight: 700 }}>{order.rate}</span>}
              {order.available && <span style={{ fontSize: 12, color: BRAND.gray }}>Available: <strong>{order.available}</strong></span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const BRAND = {
  cream: "#F5F0E8",
  orange: "#E8480A",
  black: "#0F0D0A",
  gray: "#6B6558",
  lightGray: "#C8C2B4",
  border: "#E8E2D8",
  cardBg: "#FFFFFF",
} as const;

const SUGGESTED_QUESTIONS: string[] = [
  "How does Trust Vault work?",
  "How do I become an LP?",
  "Is my money safe?",
  "What currencies do you support?",
  "How is this different from Binance P2P?",
  "What are the fees?",
];

const WALLET_SUGGESTED_QUESTIONS: string[] = [
  "What orders do I have?",
  "What's the current USDC/NGN rate?",
  "Do I have any active reservations?",
  "How do I create a sell order?",
  "Generate a merchant QR for ₦5,000",
  "What are the fees?",
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  action?: ChatAction | null;
}

interface TrustVaultChatProps {
  embedded?: boolean;
  walletContext?: string | null;
}

function StreamingCursor(): JSX.Element {
  return (
    <span
      style={{
        display: "inline-block",
        width: 2,
        height: "1em",
        background: BRAND.gray,
        marginLeft: 1,
        verticalAlign: "text-bottom",
        animation: "blink 1s step-end infinite",
      }}
    >
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </span>
  );
}

interface MessageProps {
  message: ChatMessage;
  onDismissAction: () => void;
  streaming?: boolean;
  onPickOrder?: (order: ParsedOrder) => void;
  onActionSuccess?: (resultMessage: string) => void;
}

function Message({ message, onDismissAction, streaming, onPickOrder, onActionSuccess }: MessageProps): JSX.Element {
  const isUser = message.role === "user";

  const disambigOrders = useMemo(
    () => !isUser && !streaming && onPickOrder && isDisambiguationMessage(message.content, message.action)
      ? parseDisambiguationOrders(message.content)
      : [],
    [isUser, streaming, message.content, message.action, onPickOrder]
  );
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: isUser ? "flex-end" : "flex-start",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        {!isUser && (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              marginBottom: 2,
            }}
          >
            <Image
              src="/Trust_AI.png"
              alt="Trust AI"
              width={28}
              height={28}
              style={{ objectFit: "cover" }}
            />
          </div>
        )}

        <div
          style={{
            maxWidth: "78%",
            background: isUser ? BRAND.black : BRAND.cardBg,
            color: isUser ? "#fff" : BRAND.black,
            border: isUser ? "none" : `1.5px solid ${BRAND.border}`,
            borderRadius: isUser
              ? "16px 16px 4px 16px"
              : "16px 16px 16px 4px",
            padding: "10px 14px",
            fontSize: 14,
            lineHeight: 1.6,
            fontFamily: "Georgia, serif",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
          {streaming && <StreamingCursor />}
        </div>
      </div>

      {!isUser && message.action && (
        <div style={{ paddingLeft: 36 }}>
          <ActionCard 
          action={message.action} 
          onDismiss={onDismissAction} 
          onSuccess={onActionSuccess}
          />
        </div>
      )}

      {disambigOrders.length > 1 && onPickOrder && (
        <div style={{ paddingLeft: 36 }}>
          <OrderPickerCards orders={disambigOrders} onPick={onPickOrder} />
        </div>
      )}
    </div>
  );
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- /gm, "• ")
    .replace(/^  /gm, "&nbsp;&nbsp;"); // preserve indentation
}

// ── Speech recognition types (not always present in lib.dom) ─────────────────
interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
}
interface ISpeechRecognitionCtor {
  new (): ISpeechRecognition;
}

export default function TrustVaultChat({
  embedded = false,
  walletContext = null,
}: TrustVaultChatProps): JSX.Element {
  const isWalletConnected = !!walletContext;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: isWalletConnected
        ? "Hey! I can see your wallet is connected. Ask me about your orders, current rates, reservations — or say something like 'create a sell order for 500 USDC at ₦1,650' and I'll set it up. 👋"
        : "Hey! I'm the Trust Vault AI. Ask me anything about how Trust Vault works, becoming an LP, fees, security — or just say 'I want to buy 100 USDC with NGN' and I'll set it up for you. 👋",
    },
  ]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [online, setOnline] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Voice state ───────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false); // TTS on/off toggle
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  // QVAC TTS: keep a reference to the currently playing AudioBufferSourceNode
  // so we can stop it when the user disables voice or sends a new message.
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/chat");
        const data = (await res.json()) as { online: boolean };
        setOnline(data.online);
      } catch {
        setOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, loading]);

  const dismissAction = useCallback((index: number) => {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, action: null } : m))
    );
  }, []);

  // ── Voice input: toggle mic ────────────────────────────────────────────────
  const toggleListening = useCallback(() => {
    const SpeechRecognitionCtor: ISpeechRecognitionCtor | undefined =
      (window as Window & { SpeechRecognition?: ISpeechRecognitionCtor; webkitSpeechRecognition?: ISpeechRecognitionCtor })
        .SpeechRecognition ??
      (window as Window & { SpeechRecognition?: ISpeechRecognitionCtor; webkitSpeechRecognition?: ISpeechRecognitionCtor })
        .webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError("Voice input is not supported in this browser. Try Chrome.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const rec = new SpeechRecognitionCtor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    recognitionRef.current = rec;

    rec.onstart = () => setIsListening(true);
    rec.onend   = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setInput(transcript);
      // Auto-send on final result
      if (e.results[e.results.length - 1].isFinal) {
        setIsListening(false);
        // Small delay so setInput settles before send reads it
        setTimeout(() => sendRef.current?.(transcript), 2000);
      }
    };

    rec.start();
  }, [isListening]);

  // ── Voice output: speak AI reply via QVAC Chatterbox TTS ─────────────────
  // POSTs text to /api/tts → receives raw Int16 PCM (24 kHz, mono) →
  // decodes it with Web Audio API and plays it through the user's speakers.
  const speak = useCallback(async (text: string) => {
    if (!voiceEnabled) return;

    // Stop any currently playing audio immediately
    try { audioSourceRef.current?.stop(); } catch { /* already stopped */ }

    try {
      const res = await fetch("/api/tts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text }),
      });

      if (!res.ok) return; // silently ignore TTS errors — chat still works

      // The route returns raw Int16 PCM (24 kHz, mono).
      const arrayBuffer = await res.arrayBuffer();

      // Lazily create (or resume) the shared AudioContext
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();

      // Convert Int16 PCM → Float32 (Web Audio API works in float)
      const int16    = new Int16Array(arrayBuffer);
      const float32  = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

      // Create an AudioBuffer and fill it
      const audioBuf = ctx.createBuffer(1, float32.length, 24000);
      audioBuf.copyToChannel(float32, 0);

      // Wire up source → destination and play
      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(ctx.destination);
      source.start();
      audioSourceRef.current = source;
    } catch (err) {
      console.error("[TTS] playback error:", err);
      // Non-fatal — the chat continues to work without audio
    }
  }, [voiceEnabled]);

  const sendRef = useRef<((text: string) => Promise<void>) | null>(null);

  const send = useCallback(
    async (text?: string): Promise<void> => {
      const userText = (text ?? input).trim();
      if (!userText || loading) return;

      const newMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: userText },
      ];
      setMessages(newMessages);
      setInput("");
      setLoading(true);
      setStreamingContent("");
      setError("");

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            ...(walletContext ? { walletContext } : {}),
          }),
        });

        if (!res.ok || !res.body) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Request failed");
        }

        // Read SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();

            let event: {
              token?: string;
              done?: boolean;
              cleanText?: string;
              action?: ChatAction | null;
            };
            try {
              event = JSON.parse(raw);
            } catch {
              continue;
            }

            if (event.token) {
              accumulated += event.token;
              setStreamingContent(accumulated);
            }

            if (event.done) {
              // Finalise the message with the clean text and action
              const finalContent = event.cleanText ?? accumulated;
              setMessages([
                ...newMessages,
                {
                  role: "assistant",
                  content: finalContent,
                  action: event.action ?? null,
                },
              ]);
              setStreamingContent("");
              speak(finalContent);
            }
          }
        }
      } catch (e) {
        setError(
          (e as Error).message || "Something went wrong. Please try again."
        );
        setMessages(messages);
        setStreamingContent("");
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, messages, loading, walletContext, speak]
  );

sendRef.current = send;

const [pendingSuccess, setPendingSuccess] = useState<string | null>(null);

const handleActionSuccess = useCallback((resultMessage: string) => {
  setPendingSuccess(`[SYSTEM: Action completed. ${resultMessage}]`);
}, []);

useEffect(() => {
  if (!loading && pendingSuccess) {
    setPendingSuccess(null);
    sendRef.current?.(pendingSuccess);
  }
}, [loading, pendingSuccess]);

useEffect(() => {
  const handleStorage = (e: StorageEvent) => {
    if (e.key !== "tv_qr_success" || !e.newValue) return;
    localStorage.removeItem("tv_qr_success");
    const { amount, currency } = JSON.parse(e.newValue) as { amount: number; currency: string };
    setPendingSuccess(`QR payment completed: ${amount?.toLocaleString()} ${currency} received successfully.`);
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}, []);

  // When user taps an order card, send a message that gives the AI both the
  // order identity AND the original intent so it knows to ask for the amount next.
  const handlePickOrder = useCallback((order: ParsedOrder) => {
    sendRef.current?.(`I want to reduce the ${order.label} (${order.pda})`);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const showSuggestions = messages.length <= 1 && !loading && !streamingContent;
  const suggestions = isWalletConnected
    ? WALLET_SUGGESTED_QUESTIONS
    : SUGGESTED_QUESTIONS;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: embedded ? "100%" : "100vh",
        background: BRAND.cream,
        fontFamily: "'Syne', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&display=swap');
        * { box-sizing: border-box; }
        textarea::placeholder { color: #C8C2B4; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${BRAND.border}; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `2px solid ${BRAND.orange}`,
          background: BRAND.black,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            overflow: "hidden",
            border: `2px solid ${BRAND.orange}40`,
            flexShrink: 0,
          }}
        >
          <Image
            src="/Trust_AI.png"
            alt="Trust AI"
            width={36}
            height={36}
            style={{ objectFit: "cover" }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: ".02em",
            }}
          >
            Trust Vault AI
          </div>
          <div
            style={{
              fontSize: 11,
              color:
                online === null
                  ? BRAND.lightGray
                  : online
                  ? "#22c55e"
                  : "#ef4444",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background:
                  online === null
                    ? BRAND.lightGray
                    : online
                    ? "#22c55e"
                    : "#ef4444",
              }}
            />
            {online === null ? "Checking…" : online ? "Online" : "Offline"}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 16px 8px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.filter((m) => !m.content.startsWith("[SYSTEM:")).map((m, i) => (
          <Message
            key={i}
            message={m}
            onDismissAction={() => dismissAction(i)}
            onPickOrder={m.role === "assistant" ? handlePickOrder : undefined}
            onActionSuccess={handleActionSuccess}
          />
        ))}

        {/* Streaming message — shown while tokens are arriving */}
        {streamingContent && (
          <Message
            message={{ role: "assistant", content: streamingContent }}
            onDismissAction={() => {}}
            streaming={true}
          />
        )}

        {/* Typing indicator — shown only before first token arrives */}
        {loading && !streamingContent && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <Image
                src="/Trust_AI.png"
                alt="Trust AI"
                width={28}
                height={28}
                style={{ objectFit: "cover", borderRadius: "50%" }}
              />
            </div>
            <div
              style={{
                background: BRAND.cardBg,
                border: `1.5px solid ${BRAND.border}`,
                borderRadius: "16px 16px 16px 4px",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: BRAND.lightGray,
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
              <style>{`
                @keyframes bounce {
                  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                  30% { transform: translateY(-5px); opacity: 1; }
                }
              `}</style>
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 12,
              fontSize: 13,
              color: "#dc2626",
              fontFamily: "'Syne', sans-serif",
            }}
          >
            {error}
          </div>
        )}

        {showSuggestions && (
          <div style={{ marginTop: 8, marginBottom: 4 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: BRAND.gray,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              {isWalletConnected ? "Try asking" : "Common questions"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  style={{
                    background: BRAND.cardBg,
                    border: `1.5px solid ${BRAND.border}`,
                    borderRadius: 20,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontFamily: "'Syne', sans-serif",
                    color: BRAND.black,
                    cursor: "pointer",
                    transition: "all .15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = BRAND.orange;
                    e.currentTarget.style.color = BRAND.orange;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = BRAND.border;
                    e.currentTarget.style.color = BRAND.black;
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "12px 16px 16px",
          borderTop: `1.5px solid ${BRAND.border}`,
          background: BRAND.cream,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            background: BRAND.cardBg,
            border: `1.5px solid ${isListening ? BRAND.orange : BRAND.border}`,
            borderRadius: 12,
            padding: "8px 8px 8px 14px",
            transition: "border-color .2s",
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? "Listening…"
                : isWalletConnected
                ? "Ask about your orders, rates, or create one…"
                : "Ask anything, or say 'buy 100 USDC with NGN'..."
            }
            rows={1}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: 14,
              lineHeight: 1.5,
              fontFamily: "Georgia, serif",
              color: BRAND.black,
              background: "transparent",
              maxHeight: 100,
              overflowY: "auto",
            }}
            onInput={(e) => {
              const target = e.currentTarget;
              target.style.height = "auto";
              target.style.height =
                Math.min(target.scrollHeight, 100) + "px";
            }}
          />

          {/* Mic button */}
          <button
            onClick={toggleListening}
            title={isListening ? "Stop listening" : "Speak your message"}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              flexShrink: 0,
              background: isListening ? BRAND.orange : "transparent",
              border: `1.5px solid ${isListening ? BRAND.orange : BRAND.border}`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .15s",
            }}
          >
            {isListening ? (
              /* Animated mic-active icon */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="11" rx="3" fill="white" />
                <path d="M5 11a7 7 0 0 0 14 0" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="18" x2="12" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="8"  y1="22" x2="16" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <style>{`@keyframes pulse-ring { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }`}</style>
              </svg>
            ) : (
              /* Static mic icon */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="11" rx="3" stroke={BRAND.gray} strokeWidth="2"/>
                <path d="M5 11a7 7 0 0 0 14 0" stroke={BRAND.gray} strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="18" x2="12" y2="22" stroke={BRAND.gray} strokeWidth="2" strokeLinecap="round"/>
                <line x1="8"  y1="22" x2="16" y2="22" stroke={BRAND.gray} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
          </button>

          {/* Send button */}
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              flexShrink: 0,
              background:
                !input.trim() || loading ? BRAND.border : BRAND.orange,
              border: "none",
              cursor:
                !input.trim() || loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background .15s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Bottom bar: hint + voice TTS toggle */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <div style={{ fontSize: 11, color: BRAND.lightGray }}>
            {isListening ? "🎙 Listening — speak now…" : "Enter to send · Shift+Enter for new line"}
          </div>
          {/* TTS toggle */}
          <button
            onClick={() => {
              setVoiceEnabled((v) => {
                if (v) {
                  // Stop any currently playing QVAC TTS audio
                  try { audioSourceRef.current?.stop(); } catch { /* already stopped */ }
                }
                return !v;
              });
            }}
            title={voiceEnabled ? "Turn off voice replies" : "Turn on voice replies"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: voiceEnabled ? BRAND.orange : BRAND.lightGray,
              fontFamily: "'Syne', sans-serif",
              fontWeight: 700,
              padding: "2px 4px",
            }}
          >
            {voiceEnabled ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M11 5L6 9H2v6h4l5 4V5z" fill={BRAND.orange}/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" stroke={BRAND.orange} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M11 5L6 9H2v6h4l5 4V5z" stroke={BRAND.lightGray} strokeWidth="2" strokeLinejoin="round"/>
                <line x1="23" y1="1" x2="1" y2="23" stroke={BRAND.lightGray} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
            {voiceEnabled ? "Voice on" : "Voice off"}
          </button>
        </div>
      </div>
    </div>
  );
}