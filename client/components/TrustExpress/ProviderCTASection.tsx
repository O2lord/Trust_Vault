// Usage: <ProviderCTASection />

import Link from "next/link";

const grain = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function ProviderCTASection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-[608px] mx-auto">

      {/* ── For Liquidity Providers ── */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0F0D0A] px-7 py-8 flex flex-col gap-6">
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: grain, backgroundSize: "160px" }} />
        <div className="relative space-y-1.5">
          <p className="text-[#E8480A] text-[10px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: "'Syne', sans-serif" }}>
            For Liquidity Providers
          </p>
          <Link href="/express/providers" className="text-white hover:text-white/80 transition-colors duration-150 text-xl font-semibold leading-snug" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
            Earn from your liquidity. <span className="text-[#E8480A]">→</span>
          </Link>
        </div>
      </div>

      {/* ── For Merchants ── */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0F0D0A] px-7 py-8 flex flex-col gap-6">
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: grain, backgroundSize: "160px" }} />
        <div className="relative space-y-1.5">
          <p className="text-[#E8480A] text-[10px] font-bold uppercase tracking-[0.18em] " style={{ fontFamily: "'Syne', sans-serif" }}>
            For Merchants
          </p>
          <Link href="/express/merchants" className="text-white hover:text-white/80 transition-colors duration-150 text-xl font-semibold leading-snug" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
            <span className="text-[#E8480A]">←</span> Accept crypto payments.
          </Link>
        </div>
      </div>

    </div>
  );
}