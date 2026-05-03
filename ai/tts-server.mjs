import { readFileSync } from "bare-fs";
import { join, dirname } from "bare-path";
import { fileURLToPath } from "bare-url";
import http from "bare-http1";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_DIR =
  "/Users/o2lord/projects/trust_vault v3/client/models/chatterbox-q4";

// Use resampled 24kHz reference if it exists, otherwise fall back to original
const REFERENCE_WAV_PATH = join(MODEL_DIR, "reference_24k.wav");

// Load QVAC TTS
const { default: ONNXTTS } = await import("@qvac/tts-onnx");

// Dynamically find the 'data' chunk in a WAV file instead of
// assuming a fixed 44-byte header (files with LIST/INFO metadata
// chunks will have the audio data at a different offset).
function findDataChunk(buf) {
  let i = 12; // skip RIFF/WAVE header (4+4+4 bytes)
  while (i < buf.length - 8) {
    const id = String.fromCharCode(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
    const size =
      buf[i + 4] | (buf[i + 5] << 8) | (buf[i + 6] << 16) | (buf[i + 7] << 24);
    if (id === "data") return { offset: i + 8, size };
    i += 8 + size;
  }
  throw new Error("No data chunk found in WAV file: " + REFERENCE_WAV_PATH);
}

const wavBuf = readFileSync(REFERENCE_WAV_PATH);
const { offset: dataOffset, size: dataSize } = findDataChunk(wavBuf);
const int16 = new Int16Array(
  wavBuf.buffer,
  wavBuf.byteOffset + dataOffset,
  dataSize / 2,
);
const referenceAudio = new Float32Array(int16.length);
for (let i = 0; i < int16.length; i++) referenceAudio[i] = int16[i] / 32768;

console.log(
  `[TTS] Loaded reference audio: ${referenceAudio.length} samples (~${(
    referenceAudio.length / 24000
  ).toFixed(1)}s at 24kHz)`,
);

const model = new ONNXTTS({
  engine: "chatterbox",
  files: { modelDir: MODEL_DIR },
  referenceAudio,
  config: { language: "en", useGPU: false },
  opts: { stats: false },
  logger: console,
});

await model.load();
console.log("[TTS server] Chatterbox ready on port 7779");

http
  .createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/synthesize") {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      try {
        const { text } = JSON.parse(body);
        const clean = (text ?? "")
          .replace(/\*\*(.*?)\*\*/g, "$1")
          .replace(/\*(.*?)\*/g, "$1")
          .replace(/^[•\-]\s/gm, "")
          .replace(/<[^>]+>/g, "")
          .slice(0, 600);

        console.log(`[TTS] Synthesizing ${clean.length} chars...`);

        const response = await model.run({ input: clean, type: "text" });
        const chunks = [];
        await response
          .onUpdate((d) => {
            if (d?.outputArray) chunks.push(d.outputArray);
          })
          .await();

        const totalSamples = chunks.reduce((s, c) => s + c.byteLength / 2, 0);
        const pcm = new Int16Array(totalSamples);
        let offset = 0;
        for (const c of chunks) {
          const v = new Int16Array(c);
          pcm.set(v, offset);
          offset += v.length;
        }

        console.log(
          `[TTS] Done — ${totalSamples} samples (~${(
            totalSamples / 24000
          ).toFixed(1)}s)`,
        );

        res.writeHead(200, {
          "Content-Type": "audio/pcm",
          "X-Sample-Rate": "24000",
          "Content-Length": pcm.buffer.byteLength,
        });
        res.end(Buffer.from(pcm.buffer));
      } catch (err) {
        console.error("[TTS server] error:", err);
        res.writeHead(500);
        res.end();
      }
    });
  })
  .listen(7779);
