// app/api/tts/route.ts
// Next.js App Router API route — QVAC Chatterbox TTS proxy
// Receives { text: string } → proxies to local TTS server → returns raw Int16 PCM (24 kHz, mono)
// The browser decodes it via Web Audio API (see TrustVaultChat.tsx)

// ── Rate limit ────────────────────────────────────────────────────────────────
interface RLEntry { count: number; start: number }
const rl = new Map<string, RLEntry>();
function checkRL(ip: string): boolean {
  const now = Date.now();
  const e   = rl.get(ip) ?? { count: 0, start: now };
  if (now - e.start > 60_000) { rl.set(ip, { count: 1, start: now }); return true; }
  if (e.count >= 30) return false;
  e.count++;
  rl.set(ip, e);
  return true;
}

// ── POST /api/tts ─────────────────────────────────────────────────────────────
export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRL(ip)) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawText = (body.text ?? "").trim();
  if (!rawText) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  // Strip markdown & limit length
  const text = rawText
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^[•\-]\s/gm, "")
    .replace(/<[^>]+>/g, "")
    .slice(0, 600);

  try {
    const upstream = await fetch("http://localhost:7779/synthesize", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text }),
    });

    if (!upstream.ok) {
      return Response.json({ error: "TTS failed" }, { status: 500 });
    }

    const pcm = await upstream.arrayBuffer();
    return new Response(pcm, {
      status: 200,
      headers: {
        "Content-Type":  "audio/pcm",
        "X-Sample-Rate": "24000",
        "X-Channels":    "1",
        "X-Bit-Depth":   "16",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[TTS] proxy error:", err);
    return Response.json({ error: "TTS synthesis failed." }, { status: 500 });
  }
}