"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/client-session";
import Notice from "./Notice";

interface BondInfo {
  network: string;
  token: string;
  amount: string;
  refundable: boolean;
  status: "blocked" | "dev-bypass";
  missing: string[];
}

export default function BondGate() {
  const router = useRouter();
  const [info, setInfo] = useState<BondInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState(loadSession());

  useEffect(() => {
    setSession(loadSession());
    fetch("/api/bond")
      .then((res) => res.json())
      .then(setInfo)
      .catch(() => setError("Could not load bond status"));
  }, []);

  useEffect(() => {
    if (session === null) router.replace("/submit/verify");
  }, [session, router]);

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
          <dt className="text-text-muted">You pay</dt>
          <dd className="font-mono text-text-primary text-right">network fees only</dd>
        </dl>

        {error && <Notice tone="error">{error}</Notice>}

        {info?.status === "dev-bypass" && (
          <>
            <Notice tone="warn" title="development bypass">
              This server runs with ALLOW_DEV_WITHOUT_PRIVATE_BOND. No bond is collected and no
              anonymity is claimed. This mode is refused in production builds.
            </Notice>
            <button onClick={() => router.push("/submit/interview")} className="btn-primary w-full">
              Continue without a bond (development)
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
      </div>
    </div>
  );
}
