"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ReclaimProofRequest } from "@reclaimprotocol/js-sdk";
import {
  RECLAIM_APP_ID,
  RECLAIM_APP_SECRET,
  RECLAIM_PROVIDER_ID,
} from "@/lib/reclaim";
import VerificationIframe from "./VerificationIframe";

type Status = "idle" | "loading" | "verifying" | "submitting" | "error";

export default function VerificationFlow() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = useCallback(async () => {
    try {
      setStatus("loading");
      setError(null);

      const reclaimRequest = await ReclaimProofRequest.init(
        RECLAIM_APP_ID,
        RECLAIM_APP_SECRET,
        RECLAIM_PROVIDER_ID,
        {
          useAppClip: false,
          customSharePageUrl: "https://portal.reclaimprotocol.org/popcorn",
        }
      );

      await reclaimRequest.startSession({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSuccess: async (proofs: any) => {
          setIframeUrl(null);
          setStatus("submitting");

          try {
            const res = await fetch("/api/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ proofs: Array.isArray(proofs) ? proofs : [proofs] }),
            });

            if (!res.ok) throw new Error("Verification API failed");

            const { credential, sessionToken } = await res.json();

            sessionStorage.setItem("sj_session", sessionToken);
            sessionStorage.setItem(
              "sj_credential",
              JSON.stringify(credential)
            );

            router.push("/submit/interview");
          } catch (err) {
            console.error("Submit error:", err);
            setError(
              err instanceof Error ? err.message : "Failed to verify proof"
            );
            setStatus("error");
          }
        },
        onError: (err: Error) => {
          console.error("Verification error:", err);
          setIframeUrl(null);
          setError(err?.message || String(err));
          setStatus("error");
        },
      });

      const requestUrl = await reclaimRequest.getRequestUrl();
      setIframeUrl(requestUrl);
      setStatus("verifying");
    } catch (err) {
      console.error("Init error:", err);
      setIframeUrl(null);
      setError(
        err instanceof Error ? err.message : JSON.stringify(err)
      );
      setStatus("error");
    }
  }, [router]);

  const handleCloseIframe = useCallback(() => {
    setIframeUrl(null);
    if (status === "verifying") setStatus("idle");
  }, [status]);

  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="card p-8">
        <div className="font-mono text-[11px] text-text-muted mb-4">
          {"// step_01: credential_verification"}
        </div>

        <h2 className="text-xl font-bold text-text-primary mb-3">
          Verify Your Identity
        </h2>
        <p className="text-sm text-text-secondary mb-8">
          Use Reclaim Protocol to prove your credentials via zkTLS. Your login
          data never touches our servers.
        </p>

        <button
          onClick={handleVerify}
          disabled={status === "loading" || status === "submitting"}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "idle" && "Start Verification"}
          {status === "loading" && "Initializing SDK..."}
          {status === "verifying" && "Waiting for Proof..."}
          {status === "submitting" && "Verifying Proof..."}
          {status === "error" && "Retry Verification"}
        </button>

        {/* Status indicators */}
        {status === "loading" && (
          <div className="mt-4 px-3 py-2 rounded text-xs font-mono bg-neon-green/5 text-neon-green border border-neon-green/20">
            initializing reclaim sdk...
          </div>
        )}

        {status === "verifying" && (
          <div className="mt-4 px-3 py-2 rounded text-xs font-mono bg-neon-cyan/5 text-neon-cyan border border-neon-cyan/20">
            complete verification in the popup window
          </div>
        )}

        {status === "submitting" && (
          <div className="mt-4 px-3 py-2 rounded text-xs font-mono bg-neon-green/5 text-neon-green border border-neon-green/20">
            proof received — verifying server-side...
          </div>
        )}

        {status === "error" && error && (
          <div className="mt-4 px-3 py-2 rounded text-xs font-mono bg-error/5 text-error border border-error/20">
            error: {error}
          </div>
        )}
      </div>

      {/* Iframe overlay */}
      {iframeUrl && (
        <VerificationIframe url={iframeUrl} onClose={handleCloseIframe} />
      )}
    </div>
  );
}
