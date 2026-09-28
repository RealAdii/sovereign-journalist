"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession, saveSession } from "@/lib/client-session";
import type { BondQuote } from "@/lib/types";
import Notice from "./Notice";

interface BondInfo {
  network: string;
  token: string;
  amount: string;
  refundable: boolean;
  status: "blocked" | "dev-bypass" | "enabled";
  reason?: string;
  treasury?: string;
  poolFeeFri?: string | null;
  missing: string[];
}

type WalletProbe = { name: string; apiVersions: string[]; strk20: boolean; address?: string };
type Stage = "idle" | "connecting" | "quoting" | "signing" | "waiting" | "confirmed" | "error";

const MIN_WALLET_API = "0.10.3";
const POLL_MS = 6000;

function strk(fri: string | bigint | null | undefined) {
  if (fri === null || fri === undefined) return "unknown";
  const value = BigInt(fri);
  const whole = value / 10n ** 18n;
  const frac = (value % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export default function BondGate() {
  const router = useRouter();
  const [info, setInfo] = useState<BondInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState(loadSession());
  const [stage, setStage] = useState<Stage>("idle");
  const [probe, setProbe] = useState<WalletProbe | null>(null);
  const [recipient, setRecipient] = useState("");
  const [quote, setQuote] = useState<BondQuote | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const walletRef = useRef<unknown>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSession(loadSession());
    fetch("/api/bond")
      .then((res) => res.json())
      .then(setInfo)
      .catch(() => setError("Could not load bond status"));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (session === null) router.replace("/submit/verify");
  }, [session, router]);

  const token = session?.token;

  // Wallet API probe: version query only, never a balance call (that prompts
  // the user for data the app has no reason to see).
  const checkWallet = useCallback(async () => {
    setStage("connecting");
    setError(null);
    try {
      const [{ createStore }, { compareVersions, walletV6 }] = await Promise.all([
        import("@starknet-io/get-starknet-discovery"),
        import("starknet"),
      ]);
      const store = createStore();
      const wallets = store.getWallets();
      if (wallets.length === 0) throw new Error("No Starknet wallet was found in this browser. Install Ready and switch it to Sepolia.");
      // get-starknet-discovery 6.0.3 and starknet 10.4.0 carry the wallet type from two
      // copies of @starknet-io/types-js; the runtime shape is the same.
      const wallet = wallets[0] as never;
      const versions = await walletV6.supportedWalletApi(wallet);
      const strk20 = versions.some((v) => compareVersions(v, MIN_WALLET_API) >= 0);
      let address: string | undefined;
      if (strk20) {
        const accounts = await walletV6.requestAccounts(wallet);
        address = accounts[0];
      }
      walletRef.current = wallet;
      setProbe({ name: wallets[0].name, apiVersions: versions, strk20, address });
      if (address && !recipient) setRecipient(address);
      setStage("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet check failed");
      setStage("error");
    }
  }, [recipient]);

  const startPolling = useCallback(
    (sessionToken: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      const tick = async () => {
        try {
          const res = await fetch("/api/bond/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: sessionToken }),
          });
          const data = (await res.json()) as BondQuote & { error?: string };
          if (res.status === 401) {
            if (pollRef.current) clearInterval(pollRef.current);
            setError("Session expired. Use your recovery code.");
            setStage("error");
            return;
          }
          if (data.status === "confirmed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setQuote(data);
            setStage("confirmed");
            const current = loadSession();
            if (current) saveSession({ ...current, bondStatus: "confirmed" });
          }
        } catch {
          // keep polling
        }
      };
      pollRef.current = setInterval(tick, POLL_MS);
      void tick();
    },
    [],
  );

  const payBond = useCallback(async () => {
    if (!token || !walletRef.current) return;
    setError(null);
    setStage("quoting");
    try {
      const quoteRes = await fetch("/api/bond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, recipient }),
      });
      const quoted = (await quoteRes.json()) as BondQuote & { error?: string };
      if (!quoteRes.ok) throw new Error(quoted.error || "Could not get a bond quote");
      setQuote(quoted);
      if (quoted.status === "confirmed") {
        setStage("confirmed");
        return;
      }
      setStage("signing");
      const { walletV6 } = await import("starknet");
      const result = await walletV6.strk20InvokeTransaction(walletRef.current as never, [
        { type: "transfer", token: quoted.tokenAddress, amount: quoted.expectedAmountFri, recipient: quoted.treasury },
      ]);
      setTxHash(result.transaction_hash);
      setStage("waiting");
      startPolling(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The bond payment did not go through");
      setStage("error");
    }
  }, [token, recipient, startPolling]);

  return (
    <div className="max-w-lg mx-auto">
      <div className="card p-6 sm:p-8 space-y-4">
        <div className="font-mono text-[11px] text-text-muted">{"// step_02: refundable_bond"}</div>
        <h2 className="text-xl font-bold text-text-primary">Refundable spam bond</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-xs">
          <dt className="text-text-muted">Network</dt>
          <dd className="font-mono text-text-primary text-right">Starknet Sepolia (testnet)</dd>
          <dt className="text-text-muted">Amount</dt>
          <dd className="font-mono text-text-primary text-right">{info ? `${info.amount} ${info.token}` : "1 STRK"}</dd>
          <dt className="text-text-muted">Returned</dt>
          <dd className="font-mono text-text-primary text-right">after the interview or on cancellation</dd>
          <dt className="text-text-muted">How</dt>
          <dd className="font-mono text-text-primary text-right">private STRK20 transfer, no public leg</dd>
        </dl>

        {error && <Notice tone="error">{error}</Notice>}

        {info?.status === "dev-bypass" && (
          <>
            <Notice tone="warn" title="no bond on this deployment">
              {info.reason || "No bond is collected on this server, so the spam control is off and no anonymity is claimed for payments."}
            </Notice>
            <button onClick={() => router.push("/submit/interview")} className="btn-primary w-full">
              Continue without a bond (testnet)
            </button>
          </>
        )}

        {info?.status === "blocked" && (
          <>
            <Notice tone="error" title="anonymous bond is blocked on Sepolia">
              A bond paid with a normal token transfer would put your wallet address next to this
              interview on a public chain. We will not collect one and call it anonymous. The private
              path needs the following before it can be enabled:
            </Notice>
            <ul className="list-disc pl-5 text-xs text-text-secondary space-y-1">
              {info.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="text-xs text-text-muted">
              The interview and publishing steps stay disabled until this is resolved. Your
              verification session remains valid for two hours and can be cancelled at any time.
            </p>
            <button onClick={() => router.push("/submit")} className="btn-outline w-full !text-xs">
              Back to overview
            </button>
          </>
        )}

        {info?.status === "enabled" && stage !== "confirmed" && (
          <>
            <Notice tone="info" title="what happens">
              Your wallet sends {info.amount} STRK privately inside the STRK20 pool to the treasury.
              The amount is encrypted onchain; only the treasury can read it, and it is how the server
              matches the payment to this session. The pool charges its own fee per private operation,
              paid by you on the way in and by the treasury on the refund. You need shielded STRK in
              your wallet already; shielding is a separate, public step you do in the wallet first.
            </Notice>
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-text-muted">Bond</dt>
              <dd className="font-mono text-text-primary text-right">{info.amount} STRK (+ a few fri to tag this session)</dd>
              <dt className="text-text-muted">Pool fee (you)</dt>
              <dd className="font-mono text-text-primary text-right">{strk(info.poolFeeFri)} STRK</dd>
              <dt className="text-text-muted">Total you spend now</dt>
              <dd className="font-mono text-text-primary text-right">{info.poolFeeFri ? strk(BigInt(info.poolFeeFri) + 10n ** 18n) : "unknown"} STRK</dd>
              <dt className="text-text-muted">Refund you receive</dt>
              <dd className="font-mono text-text-primary text-right">{info.amount} STRK, privately</dd>
              <dt className="text-text-muted">Treasury</dt>
              <dd className="font-mono text-text-primary text-right break-all">{info.treasury}</dd>
            </dl>

            {!probe && (
              <button onClick={checkWallet} disabled={stage === "connecting"} className="btn-outline w-full !text-xs disabled:opacity-50">
                {stage === "connecting" ? "Checking wallet" : "Check wallet"}
              </button>
            )}

            {probe && (
              <div className="rounded border border-border bg-bg-elevated px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-text-muted">Wallet</span><span className="font-mono text-text-primary">{probe.name}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Wallet API</span><span className="font-mono text-text-primary">{probe.apiVersions.join(", ") || "none"}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">STRK20 support</span><span className={`font-mono ${probe.strk20 ? "text-neon-green" : "text-error"}`}>{probe.strk20 ? "yes" : "no"}</span></div>
              </div>
            )}

            {probe && !probe.strk20 && (
              <Notice tone="error" title="this wallet cannot pay privately">
                It does not expose Wallet API {MIN_WALLET_API} or newer, so it cannot make a STRK20 private
                transfer. Use a privacy-enabled wallet such as Ready on Sepolia. A public transfer is not
                accepted as a substitute.
              </Notice>
            )}

            {probe?.strk20 && (
              <>
                <label className="block text-xs text-text-secondary">
                  Refund recipient (a pool-registered Starknet address; defaults to your connected account)
                  <input
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value.trim())}
                    spellCheck={false}
                    className="mt-1 w-full bg-bg-elevated border border-border rounded px-3 py-2 text-xs font-mono text-text-primary"
                  />
                </label>
                <button
                  onClick={payBond}
                  disabled={stage === "quoting" || stage === "signing" || stage === "waiting" || !/^0x[0-9a-fA-F]{1,64}$/.test(recipient)}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {stage === "quoting" && "Preparing quote"}
                  {stage === "signing" && "Confirm in your wallet"}
                  {stage === "waiting" && "Waiting for the treasury to see the note"}
                  {(stage === "idle" || stage === "error") && `Pay ${info.amount} STRK privately`}
                </button>
              </>
            )}

            {quote && stage === "signing" && (
              <Notice tone="info">
                Exact amount to sign: {quote.expectedAmountFri} fri ({strk(quote.expectedAmountFri)} STRK). The wallet
                will prompt once for the private transfer.
              </Notice>
            )}
            {stage === "waiting" && (
              <Notice tone="info">
                Transaction {txHash ? `${txHash.slice(0, 12)}...` : "submitted"}. Notes mature about ten
                blocks after creation; this usually takes under a minute. This page continues by itself.
              </Notice>
            )}
          </>
        )}

        {stage === "confirmed" && (
          <>
            <Notice tone="ok" title="bond confirmed">
              The treasury found a private note with this session&apos;s exact amount. Nothing public
              links your wallet to this interview. The bond is refunded privately to {quote?.recipient.slice(0, 10)}... when
              you finish or cancel.
            </Notice>
            <button onClick={() => router.push("/submit/interview")} className="btn-primary w-full">
              Continue to the interview
            </button>
          </>
        )}
      </div>
    </div>
  );
}
