"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ReclaimProofRequest, type FlowHandle } from "@reclaimprotocol/js-sdk";
import { saveSession } from "@/lib/client-session";
import type { IssuedCapability } from "@/lib/types";
import Notice from "./Notice";

type Status = "idle" | "starting" | "verifying" | "submitting" | "done" | "error";

export default function VerificationFlow() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCapability | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<FlowHandle | null>(null);

  const closeFlow = useCallback(() => {
    handleRef.current?.close();
    handleRef.current = null;
  }, []);

  useEffect(() => closeFlow, [closeFlow]);

  const handleVerify = useCallback(async () => {
    setStatus("starting");
    setError(null);
    try {
      const startRes = await fetch("/api/verify/start", { method: "POST" });
      if (!startRes.ok) {
        const data = await startRes.json().catch(() => ({}));
        throw new Error(data.error || "Could not start verification");
      }
      const { verificationId, requestJson } = (await startRes.json()) as {
        verificationId: string;
        requestJson: string;
      };

      // The request was created and signed on the server. The app secret never
      // reaches the browser. Its context binds the proof to this verificationId.
      const request = await ReclaimProofRequest.fromJsonString(requestJson);

      await request.startSession({
        onSuccess: async (proofs) => {
          closeFlow();
          setStatus("submitting");
          try {
            const res = await fetch("/api/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ verificationId, proofs }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Proof verification failed");
            const capability = data as IssuedCapability;
            saveSession({
              token: capability.token,
              bondStatus: capability.bondStatus,
              provider: capability.credential.provider,
              expiresAt: capability.expiresAt,
            });
            setIssued(capability);
            setStatus("done");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Proof verification failed");
            setStatus("error");
          }
        },
        onError: (err: Error) => {
          closeFlow();
          setError(err?.message || "Verification was cancelled");
          setStatus("error");
        },
      });

      // Portal mode (remote browser verification), embedded in this page. On
      // desktop the Reclaim browser extension is used automatically if present.
      setStatus("verifying");
      handleRef.current = await request.triggerReclaimFlow(
        containerRef.current ? { target: containerRef.current } : undefined,
      );
    } catch (err) {
      closeFlow();
      setError(err instanceof Error ? err.message : "Verification could not start");
      setStatus("error");
    }
  }, [closeFlow]);

  const cancel = useCallback(() => {
    closeFlow();
    setStatus("idle");
  }, [closeFlow]);

  if (status === "done" && issued) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card p-6 sm:p-8 text-left space-y-4">
          <div className="font-mono text-[11px] text-neon-green">credential proven</div>
          <p className="text-sm text-text-secondary">
            Reclaim verified a proof for provider <span className="font-mono text-text-primary">{issued.credential.provider}</span>.
          </p>
          <Notice tone="info" title="what the proof disclosed to this server">
            {issued.credential.disclosedFields.length === 0
              ? "No parameter values were disclosed. Only the provider and a valid signature."
              : `These fields were disclosed: ${issued.credential.disclosedFields.join(", ")}. Their values were kept on the server only for this session and are never written to Starknet or given to the AI model.`}
          </Notice>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1">recovery code, shown once</div>
            <code className="block break-all bg-bg-elevated border border-border rounded px-3 py-2 text-xs text-neon-cyan select-all">
              {issued.recoveryCode}
            </code>
            <p className="text-xs text-text-muted mt-2">
              Save this somewhere private. If you lose this browser tab or an AI request fails, enter it at
              the recovery page to continue for up to two hours. It is not stored anywhere readable by us.
            </p>
          </div>
          <label className="flex items-start gap-2 text-xs text-text-secondary">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
            I saved the recovery code.
          </label>
          <button onClick={() => router.push("/submit/bond")} disabled={!acknowledged} className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
            Continue to bond
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="card p-6 sm:p-8">
        <div className="font-mono text-[11px] text-text-muted mb-4">{"// step_01: credential_verification"}</div>
        <h2 className="text-xl font-bold text-text-primary mb-3">Prove a credential</h2>
        <p className="text-sm text-text-secondary mb-4">
          Reclaim Protocol lets you prove that you can log in to a provider without giving us your
          password. The verification runs in Reclaim&apos;s portal below (or the Reclaim browser
          extension if you have it). The proof is checked cryptographically on our server, matched
          to the exact provider template, and bound to this request so it cannot be replayed.
        </p>
        <div className="mb-6">
          <Notice tone="warn" title="what a proof can reveal">
            A Reclaim proof discloses whatever parameters the chosen provider template extracts.
            Some templates reveal an employer or a role, and some reveal an email or a username.
            After verification we show you exactly which fields were disclosed.
          </Notice>
        </div>

        {status !== "verifying" && (
          <button
            onClick={handleVerify}
            disabled={status === "starting" || status === "submitting"}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "idle" && "Start verification"}
            {status === "starting" && "Preparing request"}
            {status === "submitting" && "Checking proof"}
            {status === "error" && "Retry verification"}
          </button>
        )}

        <div
          ref={containerRef}
          className={`mt-4 rounded border border-border bg-white overflow-hidden ${status === "verifying" ? "min-h-[560px]" : "hidden"}`}
          aria-live="polite"
          aria-label="Reclaim verification"
        />

        <div className="mt-4 space-y-2">
          {status === "verifying" && (
            <>
              <Notice tone="info">Complete the verification in the Reclaim portal above. If it opened in a new tab instead, finish it there and come back.</Notice>
              <button onClick={cancel} className="btn-outline !text-xs w-full">Cancel verification</button>
            </>
          )}
          {status === "submitting" && <Notice tone="ok">Proof received. Verifying signatures, provider template, and challenge on the server.</Notice>}
          {status === "error" && error && <Notice tone="error">{error}</Notice>}
        </div>
      </div>
    </div>
  );
}
