# Trust Vault — QVAC Integration

**Trust Vault** is a non-custodial P2P crypto-to-fiat settlement protocol on Solana, built for Nigeria and Sub-Saharan Africa. This document covers the QVAC AI integration specifically — how it works, how to run it, and why it's built the way it is.

Live app: [trustv6ult.xyz]
Smart contract: `6gHrdm5AtG8TFvMknv5ZBEt1CHpKwBEToVbEaGBL8r7M`

## What the QVAC integration does

Trust Vault embeds a fully local AI assistant — powered by QVAC — directly into the protocol interface. The assistant is not a support chatbot. It is the primary interface for creating and managing on-chain orders.

A user can say:

> _"Create a buy order for 200 USDC at the proce of 1,520, currency NGN "_

and the assistant will parse the intent, extract the parameters, and open the order creation dialog pre-filled and ready to sign no navigation, no form-filling.

**Supported actions via natural language:**

- Create buy orders (LP liquidity provision)
- Create sell orders
- Reserve tokens from an existing LP order
- Reduce or fully close an existing order
- Generate merchant QR codes for fiat-denominated payments
- Update prices on existing orders
- Answer questions about the protocol and the user's live on-chain state

---

## QVAC capabilities used

| Capability     | Package                   | Usage                                                      |
| -------------- | ------------------------- | ---------------------------------------------------------- |
| LLM inference  | `@qvac/cli` + `@qvac/sdk` | Intent parsing, action extraction, context-aware responses |
| Text-to-speech | `@qvac/tts-onnx`          | Spoken AI responses via Chatterbox Q4 ONNX model           |

**Model:** Qwen3 4B (Q4_K_M quantization, llama.cpp backend), 8,192-token context window  
**TTS model:** Chatterbox Q4 — ONNX runtime, 24 kHz mono PCM output  
**Runtime:** `bare-runtime` (Holepunch/Pear ecosystem)  
**Cloud calls:** Zero. All inference runs on the local machine.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   User's Browser                    │
│                                                     │
│  FloatingChat.tsx                                   │
│    └── TrustVaultChat.tsx                           │
│         ├── useChatContext.ts  ← live Solana state  │
│         └── ActionCard.tsx     ← triggers dialogs   │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP (same machine)
┌──────────────────▼──────────────────────────────────┐
│              Next.js API Routes                     │
│                                                     │
│  /api/chat   → proxies to QVAC LLM (port 11434)    │
│  /api/tts    → proxies to TTS server (port 7779)   │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              ai/ — QVAC Node (local)                │
│                                                     │
│  qvac serve openai   → Qwen3-4B on port 11434       │
│  tts-server.mjs      → Chatterbox Q4 on port 7779   │
└─────────────────────────────────────────────────────┘
```

### Key design decisions

**1. Live on-chain state injection**

Before every message, `useChatContext.ts` fetches all live `TrustExpress` accounts from Solana and serializes the connected wallet's current state into a plain-text block injected directly into the system prompt. This gives the model real-time awareness of the user's buy orders, sell orders, active reservations, and the best available market rates across all LPs — without any database or backend.

**2. Structured action extraction**

The system prompt instructs the model to append a single `<action>` JSON block when it detects user intent. The streaming parser in `/api/chat/route.ts` accumulates the full response, strips the action block before it reaches the UI (so users never see raw JSON), and emits a final `done` event with `{ cleanText, action }`. `ActionCard.tsx` reads the action type and opens the appropriate dialog pre-filled.

**3. Think-block filtering**

Qwen3 emits `<think>...</think>` reasoning tokens. The streaming parser detects and buffers these, discarding them before any text reaches the client. Users see only the final answer.

**4. Local TTS via Chatterbox**

`tts-server.mjs` runs a bare-runtime HTTP server that accepts text at `POST /synthesize` and returns raw Int16 PCM at 24 kHz. The Next.js TTS route proxies this to the browser, which decodes it via Web Audio API. Markdown and HTML are stripped before synthesis so the voice output is clean.

**5. Privacy alignment**

Trust Vault is non-custodial — no KYC, no user registration, no stored data. Routing a user's on-chain financial position through a cloud LLM would contradict that. With QVAC, the model sees the user's orders; no external server does.

## Repo structure

```
trust_vault_v3/
├── ai/                          # QVAC node (run separately)
│   ├── package.json
│   ├── qvac.config.json         # Model config — Qwen3-4B
│   └── tts-server.mjs           # Chatterbox TTS bare-runtime server
│
└── client/                      # Next.js app
    ├── app/
    │   └── api/
    │       ├── chat/route.ts    # LLM proxy + action parser
    │       └── tts/route.ts     # TTS proxy
    ├── components/TrustExpress/Chat/
    │   ├── TrustVaultChat.tsx   # Main chat UI
    │   ├── FloatingChat.tsx     # Floating widget (injected in layout)
    │   ├── ActionCard.tsx       # Renders AI actions, triggers dialogs
    │   └── ReduceOrderDialog.tsx
    ├── hooks/express/
    │   └── useChatContext.ts    # Live on-chain state → system prompt
    └── models/
        └── chatterbox-q4/       # Local ONNX TTS model files
```

---

## Setup

### Prerequisites

- Node.js 20+
- A machine with enough RAM to run a 4B quantized model (~4 GB)
- The Trust Vault client already running (or follow client setup in the main README)

### 1. Set up the QVAC node

```bash
cd ai
npm install
```

On first run, QVAC will pull the Qwen3-4B model from the registry automatically (configured in `qvac.config.json`).

Start both the LLM server and TTS server:

```bash
npm run dev
```

This runs concurrently:

- `npx qvac serve openai` — LLM on `http://localhost:11434`
- `./node_modules/bare-runtime/bin/bare tts-server.mjs` — TTS on `http://localhost:7779`

### 2. Configure the client

In `client/`, ensure these environment variables are set (or left as defaults):

```env
AI_URL=http://localhost:11434/v1/chat/completions
AI_MODEL=trust-vault-ai
```

The TTS route hardcodes `http://localhost:7779/synthesize` — no env variable needed.

### 3. Run the client

```bash
cd client
npm run dev
```

Open `http://localhost:3000`. Connect a Solana wallet. The floating chat bubble appears in the bottom-right corner of every page.

---

## How the action pipeline works (end-to-end example)

**User says:** _"I want to create a sell order of 100 USDC at the price of 1,500 currency NGN"_

1. `TrustVaultChat.tsx` sends `{ messages, walletContext }` to `/api/chat`
2. `/api/chat/route.ts` builds a system prompt with the knowledge base + live wallet context, streams the response from QVAC
3. The streaming parser suppresses `<think>` blocks and stops streaming once `<action>` is detected
4. Final event: `{ cleanText: "Got it — opening the sell order form...", action: { type: "sell", token: "USDC", amount: 100, pricePerToken: 1500, currency: "NGN" } }`
5. `TrustVaultChat.tsx` renders the clean text + passes the action to `ActionCard.tsx`
6. `ActionCard.tsx` opens `CreateExpressSellDialog` pre-filled with all extracted parameters
7. User reviews and approves the transaction in their Solana wallet

No page navigation. No manual form entry. One wallet signature.

---

## Why local AI for a crypto-fiat protocol

Three reasons this works better locally than in the cloud:

**Privacy.** The AI assistant sees the user's live on-chain financial position — their order sizes, rates, and reservation history. Sending that to a cloud API contradicts the non-custodial, no-stored-data design of the protocol.

**Reliability.** Nigeria's internet infrastructure is unreliable. A P2P trader mid-transaction should not lose access to the interface because an API endpoint is down. Local inference is always available.

**Alignment.** Trust Vault's thesis: users should control their money without trusting a third party. QVAC's thesis: users should run their intelligence without trusting a third party. They are the same argument applied to different layers. Trust Vault's primary supported token is also USDt — QVAC is built by Tether.

---

## Demo

https://www.youtube.com/watch?v=FUrisj4Q73c

## Builder

**Emmanuel Otaru Otu** — Solana developer and founder, Abuja, Nigeria  
School of Solana Season 8 (Ackee Blockchain Security) · Superteam Nigeria  
X: [@emmanuel_o2]
GitHub: [github.com/o2lord]
