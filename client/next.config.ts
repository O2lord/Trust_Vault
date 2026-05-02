/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["https://dictionary-therapist-omaha-santa.trycloudflare.com"],
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["@qvac/tts-onnx"],
  async headers() {
    return [
      {
        source: "/.well-known/solana-actions.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Content-Type", value: "application/json" },
        ],
      },
      {
        source: "/api/chat",
        headers: [
          { key: "X-Accel-Buffering", value: "no" },
          { key: "Cache-Control", value: "no-cache, no-transform" },
        ],
      },
    ];
  },
};

export default nextConfig;