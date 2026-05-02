"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import { useValidatorEarnings } from "@/hooks/express/useValidatorEarnings";

// ── Validator page — fully self-contained ──────────────────────────────────────
//
// No sub-components, no duplicate topbar.
// The navbar already shows wallet address + app name — we don't repeat it.
// Layout: page title → hero claimable number → secondary stats → claim CTA.

const ValidatorPage: React.FC = () => {
  const { publicKey } = useWallet();
  const { program, claimValidatorFees, getTrustExpressAccounts } = useTrustExpress();

  const [mounted, setMounted]           = useState(false);
  const [globalState, setGlobalState]   = useState<any>(null);
  const [isLoadingState, setIsLoading]  = useState(true);
  const [isClaiming, setIsClaiming]     = useState(false);
  const hasFetchedRef                    = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  const fetchGlobalState = useCallback(async () => {
    if (!program) return;
    try {
      setIsLoading(true);
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );
      setGlobalState(await program.account.globalState.fetch(pda));
    } catch {
      setGlobalState(null);
    } finally {
      setIsLoading(false);
      hasFetchedRef.current = true;
    }
  }, [program]);

  useEffect(() => {
    if (!hasFetchedRef.current && program) fetchGlobalState();
  }, [program, fetchGlobalState]);

  // ── Mint address from any live vault ──────────────────────────────────────
  const mintAddress = useMemo<string | null>(() => {
    const accounts = getTrustExpressAccounts.data;
    if (!accounts || accounts.length === 0) return null;
    return accounts[0].account.mint.toString();
  }, [getTrustExpressAccounts.data]);

  // ── Earnings data ─────────────────────────────────────────────────────────
  const {
    earnings,
    claimableFormatted,
    totalEarnedFormatted,
    hasClaimable,
    isLoading: earningsLoading,
    error: earningsError,
    refetch,
  } = useValidatorEarnings(
    // Only fetch once we know the wallet is a registered validator
    publicKey && globalState ? mintAddress : null
  );

  // ── Claim handler ─────────────────────────────────────────────────────────
  const handleClaim = async () => {
    if (!mintAddress) { toast.error("No mint address available"); return; }
    try {
      setIsClaiming(true);
      const sig = await claimValidatorFees.mutateAsync(new PublicKey(mintAddress));
      toast.success("Claimed successfully!", {
        description: `Tx: ${sig.slice(0, 8)}…${sig.slice(-8)}`,
      });
      refetch();
    } catch (err) {
      toast.error("Claim failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsClaiming(false);
    }
  };

  // ── Shared page wrapper ───────────────────────────────────────────────────
  const Page = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      minHeight: "100vh",
      background: "#F5F0E8",
      fontFamily: "var(--font-geist-sans), 'DM Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=DM+Sans:wght@300;400;500&display=swap');
        .vp-in { animation: vpin .38s ease both; }
        .vp-in-1 { animation-delay:.05s }
        .vp-in-2 { animation-delay:.13s }
        .vp-in-3 { animation-delay:.21s }
        .vp-in-4 { animation-delay:.29s }
        @keyframes vpin { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .vp-hero {
          font-family: 'Fraunces', serif;
          font-size: clamp(64px, 12vw, 96px);
          font-weight: 600;
          letter-spacing: -.04em;
          line-height: 1;
          color: #0F0D0A;
        }
        .vp-hero.live { color: #E8480A; }
        .vp-claim {
          width: 100%;
          background: #E8480A;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 14px 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity .15s;
          font-family: inherit;
        }
        .vp-claim:hover:not(:disabled) { opacity: .88; }
        .vp-claim:disabled { opacity: .5; cursor: not-allowed; }
        .vp-refresh {
          background: transparent;
          border: none;
          cursor: pointer;
          color: rgba(15,13,10,.35);
          padding: 4px;
          display: flex;
          align-items: center;
          border-radius: 4px;
          transition: color .15s, transform .2s;
        }
        .vp-refresh:hover { color: #E8480A; transform: rotate(60deg); }
      `}</style>
      {children}
    </div>
  );

  // ── Centered layout helper ─────────────────────────────────────────────────
  const Center = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:"1rem", padding:"3rem 1.5rem", textAlign:"center" }}>
      {children}
    </div>
  );

  // ── Hydration guard ────────────────────────────────────────────────────────
  if (!mounted) {
    return (
      <Page>
        <Center>
          <Loader2 size={24} className="animate-spin" style={{ color:"#E8480A" }} />
        </Center>
      </Page>
    );
  }

  // ── No wallet ──────────────────────────────────────────────────────────────
  if (!publicKey) {
    return (
      <Page>
        <Center>
          <div style={{ width:32, height:3, background:"#E8480A", borderRadius:2 }} />
          <h1 style={{ fontSize:24, fontWeight:400, color:"#0F0D0A", margin:0 }}>Validator Portal</h1>
          <p style={{ fontSize:14, color:"rgba(15,13,10,.45)", margin:0 }}>
            Connect your wallet to access this page.
          </p>
        </Center>
      </Page>
    );
  }

  // ── Loading global state ────────────────────────────────────────────────────
  if (isLoadingState) {
    return (
      <Page>
        <Center>
          <Loader2 size={22} className="animate-spin" style={{ color:"#E8480A" }} />
          <p style={{ fontSize:13, color:"rgba(15,13,10,.4)", margin:0 }}>
            Checking validator registry…
          </p>
        </Center>
      </Page>
    );
  }

  // ── Access gate ─────────────────────────────────────────────────────────────
  const validatorCount = globalState?.validatorCount ?? 0;
  const validators: PublicKey[] = globalState?.validators?.slice(0, validatorCount) ?? [];
  const isRegistered = validators.some((v: PublicKey) => v.equals(publicKey));

  if (!isRegistered) {
    return (
      <Page>
        <Center>
          <div style={{ width:32, height:3, background:"#E8480A", borderRadius:2 }} />
          <h1 style={{ fontSize:24, fontWeight:400, color:"#0F0D0A", margin:0 }}>
            Access denied
          </h1>
          <p style={{ fontSize:13, color:"rgba(15,13,10,.5)", lineHeight:1.6, maxWidth:340, margin:0 }}>
            <code style={{ background:"#EDE8DF", borderRadius:3, padding:"1px 6px", fontSize:12 }}>
              {publicKey.toBase58().slice(0, 8)}…{publicKey.toBase58().slice(-8)}
            </code>{" "}
            is not registered as a validator on this platform.
          </p>
          <p style={{ fontSize:12, color:"rgba(15,13,10,.3)", margin:0 }}>
            Contact the platform admin to be added to the validator set.
          </p>
        </Center>
      </Page>
    );
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  const totalCredits = earnings ? Number(earnings.totalCredits.toString()) : 0;
  const lastCredited = earnings?.lastCreditedAt
    ? new Date(Number(earnings.lastCreditedAt.toString()) * 1000).toLocaleString()
    : "—";

  return (
    <Page>
      <div style={{ maxWidth:600, margin:"0 auto", padding:"2.75rem 1.5rem 4rem" }}>

        {/* Title */}
        <div className="vp-in vp-in-1" style={{ marginBottom:"2.5rem" }}>
          <p style={{ fontSize:10, fontWeight:500, letterSpacing:".18em", textTransform:"uppercase", color:"#E8480A", margin:"0 0 8px" }}>
            Fee earnings
          </p>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <h1 style={{ fontSize:"clamp(22px,4vw,27px)", fontWeight:300, color:"#0F0D0A", letterSpacing:"-.01em", lineHeight:1.2, margin:0 }}>
              Your validator earnings
            </h1>
            <button className="vp-refresh" onClick={fetchGlobalState} title="Refresh page">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Loading earnings */}
        {earningsLoading && (
          <div className="vp-in vp-in-2" style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, color:"rgba(15,13,10,.4)", padding:"1.5rem 0" }}>
            <Loader2 size={16} className="animate-spin" style={{ color:"#E8480A" }} />
            Loading earnings…
          </div>
        )}

        {/* Earnings error */}
        {earningsError && !earningsLoading && (
          <div className="vp-in vp-in-2" style={{ fontSize:13, color:"#C0392B", padding:"1rem 0" }}>
            {earningsError}{" "}
            <button onClick={() => refetch()} style={{ background:"none", border:"none", cursor:"pointer", color:"#E8480A", fontSize:13, textDecoration:"underline", padding:0 }}>
              Retry
            </button>
          </div>
        )}

        {/* No PDA yet */}
        {!earningsLoading && !earningsError && !earnings && (
          <div className="vp-in vp-in-2" style={{ background:"rgba(55,138,221,.06)", border:"1px solid rgba(55,138,221,.18)", borderRadius:12, padding:"1rem 1.25rem", fontSize:13, color:"#0C447C", lineHeight:1.55 }}>
            No vote executions yet — your earnings ledger will be created on your first credited vote.
          </div>
        )}

        {/* ── Main earnings display ── */}
        {!earningsLoading && !earningsError && earnings && (
          <>
            {/* Hero — claimable amount */}
            <div className="vp-in vp-in-2" style={{
              background:"#FFFFFF",
              border:"1px solid rgba(15,13,10,.09)",
              borderRadius:14,
              overflow:"hidden",
              marginBottom:10,
            }}>
              {/* Number zone */}
              <div style={{
                padding:"2.25rem 1.75rem 1.5rem",
                textAlign:"center",
                background: hasClaimable ? "rgba(232,72,10,.025)" : "#FAFAF8",
                borderBottom:"1px solid rgba(15,13,10,.07)",
              }}>
                <p style={{ fontSize:10, fontWeight:500, letterSpacing:".14em", textTransform:"uppercase", color:"rgba(15,13,10,.4)", margin:"0 0 14px" }}>
                  Claimable now
                </p>
                <div className={`vp-hero${hasClaimable ? " live" : ""}`}>
                  {claimableFormatted}
                </div>
                <p style={{ fontSize:12, color:"rgba(15,13,10,.35)", marginTop:10 }}>
                  tokens · ready to withdraw
                </p>
              </div>

              {/* Secondary stats */}
              <div style={{ display:"flex", borderBottom:"1px solid rgba(15,13,10,.07)" }}>
                {[
                  { label:"Lifetime earned",  value: totalEarnedFormatted },
                  { label:"Vote credits",      value: totalCredits.toLocaleString() },
                ].map(({ label, value }) => (
                  <div key={label} style={{ flex:1, padding:"1.25rem 1.5rem", borderRight:"1px solid rgba(15,13,10,.07)" }}
                    // last child no border — using inline style on the map is fine here
                  >
                    <p style={{ fontSize:10, fontWeight:500, letterSpacing:".12em", textTransform:"uppercase", color:"rgba(15,13,10,.4)", margin:"0 0 6px" }}>
                      {label}
                    </p>
                    <p style={{ fontFamily:"'Fraunces',serif", fontSize:26, fontWeight:600, color:"#0F0D0A", letterSpacing:"-.02em", lineHeight:1, margin:0 }}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Timestamp + CTA */}
              <div style={{ padding:"1.25rem 1.5rem" }}>
                <p style={{ fontFamily:"monospace", fontSize:11, color:"rgba(15,13,10,.32)", margin:"0 0 1.25rem" }}>
                  Last credited: {lastCredited}
                </p>

                {hasClaimable ? (
                  <button className="vp-claim" onClick={handleClaim} disabled={isClaiming}>
                    {isClaiming
                      ? <><Loader2 size={15} className="animate-spin" /> Claiming…</>
                      : <>Claim {claimableFormatted} tokens</>
                    }
                  </button>
                ) : (
                  <div style={{
                    display:"flex", alignItems:"center", gap:8,
                    background:"rgba(58,176,107,.07)",
                    border:"1px solid rgba(58,176,107,.22)",
                    borderRadius:10, padding:"11px 14px",
                    fontSize:13, color:"#267A46",
                  }}>
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      <circle cx="7" cy="7" r="7" fill="#3AB06B"/>
                      <polyline points="4,7 6.5,9.5 10,5" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                    </svg>
                    No pending balance — all earnings have been claimed.
                  </div>
                )}
              </div>
            </div>

            {/* Vote threshold note */}
            <p className="vp-in vp-in-3" style={{ fontSize:12, color:"rgba(15,13,10,.32)", textAlign:"center", margin:"1rem 0 0" }}>
              Payouts require{" "}
              <strong style={{ fontWeight:500, color:"rgba(15,13,10,.48)" }}>
                {globalState?.requiredVotes ?? "–"}-of-{validatorCount}
              </strong>{" "}
              validator votes to execute.
            </p>
          </>
        )}

      </div>
    </Page>
  );
};

export default ValidatorPage;