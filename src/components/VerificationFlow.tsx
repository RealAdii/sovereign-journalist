"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ReclaimProofRequest, type FlowHandle } from "@reclaimprotocol/js-sdk";
import { saveSession } from "@/lib/client-session";
import type { IssuedCapability } from "@/lib/types";
import Notice from "./Notice";

type Status = "idle" | "starting" | "verifying" | "submitting" | "done" | "error";
const POLL_MS = 3000;

export default function VerificationFlow() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCapability | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<FlowHandle | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAll = useCallback(() => {
    handleRef.current?.close();
    handleRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopAll, [stopAll]);

  const finish = useCallback((capability: IssuedCapability) => {
    saveSession({
      token: capability.token,
      bondStatus: capability.bondStatus,
      provider: capability.credential.provider,
      expiresAt: capability.expiresAt,
    });
    setIssued(capability);
    setStatus("done");
  }, []);

  const poll = useCallback(
    async (verificationId: string) => {
      try {
        const res = await fetch("/api/verify/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verificationId }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.status === "issued") {
          stopAll();
          finish(data as IssuedCapability);
        } else if (data.status === "failed" || res.status === 410) {
          stopAll();
          setError(data.detail || data.error || "Verification failed");
          setStatus("error");
        } else if (data.status !== "pending" && !res.ok) {
          stopAll();
          setError(data.error || "Verification failed");
          setStatus("error");
        }
      } catch {
        // network blip; keep polling
      }
    },
    [finish, stopAll],
  );

  const handleVerify = useCallback(async () => {
    setStatus("starting");
    setError(null);
    try {
      const startRes = await fetch("/api/verify/start", { method: "POST" });
      if (!startRes.ok) {
        const data = await startRes.json().catch(() => ({}));
        throw new Error(data.error || "Could not start verification");
      }
      const { verificationId, requestJson } = (await startRes.json()) as { verificationId: string; requestJson: string };

      // Signed on the server; the app secret never reaches the browser.
      const request = await ReclaimProofRequest.fromJsonString(requestJson);
      setStatus("verifying");
      // Wait a tick so the overlay container is mounted before embedding.
      await new Promise((r) => setTimeout(r, 0));
      handleRef.current = await request.triggerReclaimFlow(
        containerRef.current ? { target: containerRef.current } : undefined,
      );
      // The server watches Reclaim for the proof and issues the session itself.
      pollRef.current = setInterval(() => poll(verificationId), POLL_MS);
      void poll(verificationId);
    } catch (err) {
      stopAll();
      setError(err instanceof Error ? err.message : "Verification could not start");
      setStatus("error");
    }
  }, [poll, stopAll]);

  const cancel = useCallback(() => {
    stopAll();
    setStatus("idle");
  }, [stopAll]);

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
    <div className="max-w-lg mx-auto text-center">
      <div className="card p-6 sm:p-8">
        <div className="font-mono text-[11px] text-text-muted mb-4">{"// step_01: credential_verification"}</div>
        <h2 className="text-xl font-bold text-text-primary mb-3">Prove a credential</h2>
        <p className="text-sm text-text-secondary mb-4">
          Reclaim Protocol lets you prove that you can log in to a provider without giving us your
          password. The verification runs in Reclaim&apos;s portal (or the Reclaim browser extension if
          you have it). The proof is checked cryptographically on our server, matched to the exact
          provider template, and bound to this request so it cannot be replayed.
        </p>
        <div className="mb-6">
          <Notice tone="warn" title="what a proof can reveal">
            A Reclaim proof discloses whatever parameters the chosen provider template extracts.
            Some templates reveal an employer or a role, and some reveal an email or a username.
            After verification we show you exactly which fields were disclosed.
          </Notice>
        </div>

        <button
          onClick={handleVerify}
          disabled={status === "starting" || status === "verifying" || status === "submitting"}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "idle" && "Start verification"}
          {status === "starting" && "Preparing request"}
          {status === "verifying" && "Verification in progress"}
          {status === "submitting" && "Checking proof"}
          {status === "error" && "Retry verification"}
        </button>

        <div className="mt-4 space-y-2">
          {status === "error" && error && <Notice tone="error">{error}</Notice>}
        </div>
      </div>

      {status === "verifying" && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex flex-col p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Reclaim verification">
          <div className="flex items-center justify-between gap-3 px-2 pb-2 shrink-0">
            <span className="font-mono text-[11px] text-text-secondary">
              Complete the login in Reclaim&apos;s portal. This page moves on by itself as soon as the proof is verified.
            </span>
            <button onClick={cancel} className="btn-outline !py-1.5 !px-3 !text-xs shrink-0">Cancel</button>
          </div>
          <div ref={containerRef} className="flex-1 min-h-0 rounded bg-white overflow-hidden [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0" />
        </div>
      )}
    </div>
  );
}
