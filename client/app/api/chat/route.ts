import { readFileSync } from "fs";
import { join } from "path";
import { allMintEntries } from "@/lib/mintConstants";

let knowledgeBase = "";
try {
  knowledgeBase = readFileSync(
    join(process.cwd(), "knowledge", "trustvault.md"),
    "utf-8"
  );
} catch (e) {
  console.error("Could not load knowledge base:", (e as Error).message);
  knowledgeBase = "You are a Trust Vault assistant. trustexpress.app";
}

const AI_URL =
  process.env.AI_URL || "http://localhost:11434/v1/chat/completions";
const AI_MODEL = process.env.AI_MODEL || "trust-vault-ai";

const mintReference = allMintEntries()
  .map((e) => `${e.symbol}: ${e.mint} (${e.decimals} decimals)`)
  .join("\n");

interface RateLimitEntry {
  count: number;
  start: number;
}
const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) ?? { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  rateLimitMap.set(ip, entry);
  return true;
}

interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatAction {
  type: "buy" | "sell" | "reserve" | "qr" | "reduce" | "updatePrice";
  token?: string;
  mint?: string;
  amount?: number;
  pricePerToken?: number;
  currency?: string;
  paymentType?: string;
  reduceBy?: number;
  newPrice?: number;
  orderAddress?: string;
  orderType?: "buy" | "sell";
  fiatAmount?: number;
}

function parseAction(text: string): {
  cleanText: string;
  action: ChatAction | null;
} {
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const match = text.match(/<action>([\s\S]*?)<\/action>/);
  if (!match) return { cleanText: text, action: null };
  let action: ChatAction | null = null;
  try {
    action = JSON.parse(match[1].trim()) as ChatAction;
  } catch {}
  return {
    cleanText: text.replace(/<action>[\s\S]*?<\/action>/, "").trim(),
    action,
  };
}

export async function GET(): Promise<Response> {
  try {
    const res = await fetch("http://localhost:11434/v1/models", {
      signal: AbortSignal.timeout(3000),
    });
    return Response.json({ online: res.ok });
  } catch {
    return Response.json({ online: false });
  }
}

export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  let body: { messages?: unknown; walletContext?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, walletContext } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "messages array is required" },
      { status: 400 }
    );
  }

  const sanitised: ChatMessage[] = (messages as ChatMessage[])
    .slice(-20)
    .filter((m) => m.role && m.content && typeof m.content === "string")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content.slice(0, 2000),
    }));

  const liveContextBlock =
    walletContext && walletContext.trim().length > 0
      ? `\n\n## LIVE USER DATA\nThe following is real-time on-chain data for the connected wallet. Use it to answer questions about the user's orders, rates, and reservations. Always prefer this data over generic answers when the user asks about their specific situation.\n\n${walletContext.slice(0, 3000)}\n\n`
      : "\n\n## LIVE USER DATA\nNo wallet connected. Answer general questions only.\n\n";

  const systemPrompt = `You are the Trust Vault AI assistant. Answer questions about Trust Vault accurately and helpfully using the knowledge base and live user data below. Keep answers concise — 2-4 sentences for simple questions, longer only when genuinely needed. If a question is unrelated to Trust Vault or crypto, politely redirect.

## TOKEN MINT ADDRESSES
Use these exact mint addresses when emitting buy/sell actions:
${mintReference}

## ACTION DETECTION
When the user clearly wants to perform one of these operations, append ONE <action> block at the end of your reply.
Only emit an action for clear intent — not for general questions.
- When you receive a [SYSTEM: Action completed...] message, NEVER emit an <action> block in your response. Only acknowledge and suggest a next step.

### Action types and examples:

BUY ORDER — user wants to create a buy order as an LP:
<action>{"type":"buy","token":"USDC","mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":100,"pricePerToken":1300,"currency":"NGN","paymentType":"Bank Transfer"}</action>
- Always include "pricePerToken" if the user mentioned a price. If they did not mention a price, omit it (the form will leave the field empty for them to fill).

SELL ORDER — user wants to create a sell order as an LP:
<action>{"type":"sell","token":"USDC","mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":500,"pricePerToken":1.02,"currency":"NGN"}</action>

RESERVATION — user wants to reserve tokens from an existing LP order:
<action>{"type":"reserve","token":"USDC","amount":50,"currency":"NGN"}</action>

MERCHANT QR CODE — user wants to generate a QR code to accept payment:
<action>{"type":"qr","fiatAmount":1000,"currency":"NGN"}</action>

REDUCE ORDER — user wants to reduce/withdraw from an existing buy or sell order.
This is a TWO-STEP flow. Follow it exactly:

STEP 1 — Order selection:
- If the user says "reduce/cancel/close my order" without specifying which one, list their orders from live data and ask them to pick. Do NOT emit an action yet.
- Once they identify the order (by clicking a card or typing), move to Step 2.

STEP 2 — Amount confirmation:
- After the order is identified, ask: "How many tokens would you like to withdraw from this order? You can say a number (e.g. '5 USDC') or 'all' to fully close it."
- Wait for their reply with an amount.
- Only THEN emit the action with the confirmed amount as "reduceBy":
<action>{"type":"reduce","orderAddress":"4msu…Tqq9","orderType":"buy","token":"USDC","reduceBy":5,"currency":"NGN"}</action>
- If the user says "all" or "close" or "everything", use the full available balance from live data as reduceBy.
- "reduceBy" is the token amount to withdraw. "orderAddress" is the truncated PDA. "orderType" is "buy" or "sell".

UPDATE PRICE — user wants to change the price on an existing buy or sell order.
This is a TWO-STEP flow. Follow it exactly:

STEP 1 — Order selection:
- If the user has multiple orders of that type, list them and ask which one. Do NOT emit an action yet.
- Once they identify the order, move to Step 2.

STEP 2 — New price confirmation:
- If the user hasn't already provided a new price, ask: "What would you like to set the new price to? (e.g. '1,450 NGN per USDC')"
- Wait for their reply.
- Only THEN emit the action:
<action>{"type":"updatePrice","orderAddress":"D9SZ…k6mj","orderType":"buy","token":"USDC","newPrice":1450,"currency":"NGN"}</action>

General rules:
- One action block per reply, always at the very end.
- Always include the mint address for buy/sell actions if you know it.
- Supported currencies: NGN, GHS, KES, ZAR, UGX, TZS, XOF, XAF, MAD, EGP.
- For QR actions, fiatAmount is the amount in local currency the merchant wants to receive.
- Never guess the PDA. If you cannot uniquely identify the order from the live data, ask.
${liveContextBlock}

## RESPONSE FORMATTING
When displaying orders, reservations, or any structured data, always use line breaks — never pipe (|) separators. Format each order like this:

- **Buy Order** (D9SZ…k6mj)
  Rate: ₦1,500/USDC
  Available: 9.00 USDC
  Slots: 0/10 used

- **Sell Order** (ENG2…k1QG)
  Rate: ₦1,250/USDC
  Available: 8.00 USDC
  Slots: 0/10 used

Use this exact indented structure every time you show order details.

--- KNOWLEDGE BASE ---
${knowledgeBase}
--- END KNOWLEDGE BASE ---`;

  try {
    const aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        stream: true,
        messages: [{ role: "system", content: systemPrompt }, ...sanitised],
      }),
    });

    if (!aiRes.ok || !aiRes.body) {
      const errText = await aiRes.text();
      console.error("QVAC error:", errText);
      return Response.json(
        { error: "AI service unavailable. Please try again." },
        { status: 502 }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = aiRes.body!.getReader();
        let fullText = "";
        let inThinkBlock = false;
        let thinkBuffer = "";
        let actionStarted = false;

        const send = (obj: object) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
          );
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") continue;

              let token = "";
              try {
                const parsed = JSON.parse(raw) as {
                  choices?: { delta?: { content?: string } }[];
                };
                token = parsed.choices?.[0]?.delta?.content ?? "";
              } catch {
                continue;
              }

              if (!token) continue;
              fullText += token;

              // Hide <think> blocks — buffer until </think>
              if (inThinkBlock) {
                thinkBuffer += token;
                const closeIdx = thinkBuffer.indexOf("</think>");
                if (closeIdx !== -1) {
                  inThinkBlock = false;
                  const after = thinkBuffer.slice(closeIdx + 8);
                  thinkBuffer = "";
                  if (after && !after.includes("<action>")) send({ token: after });
                }
                continue;
              }

              if (token.includes("<think>")) {
                const openIdx = token.indexOf("<think>");
                const before = token.slice(0, openIdx);
                if (before) send({ token: before });
                inThinkBlock = true;
                thinkBuffer = token.slice(openIdx + 7);
                const closeIdx = thinkBuffer.indexOf("</think>");
                if (closeIdx !== -1) {
                  inThinkBlock = false;
                  const after = thinkBuffer.slice(closeIdx + 8);
                  thinkBuffer = "";
                  if (after && !after.includes("<action>")) send({ token: after });
                }
                continue;
              }

              // Once <action> starts, stop streaming — accumulate silently
              if (!actionStarted && fullText.includes("<action>")) {
                actionStarted = true;
              }
              if (actionStarted) continue;

              send({ token });
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Parse full text for action, send done event
        const { cleanText, action } = parseAction(fullText);
        send({ done: true, cleanText, action });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    console.error("Fetch to QVAC failed:", (e as Error).message);
    return Response.json(
      { error: "Could not reach AI service. Is QVAC running?" },
      { status: 503 }
    );
  }
}