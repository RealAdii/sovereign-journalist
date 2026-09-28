"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession } from "@/lib/client-session";
import Notice from "./Notice";

export default function RecoveryForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryCode: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Recovery failed");
      saveSession({ token: data.token, bondStatus: data.bondStatus, provider: "", expiresAt: data.expiresAt });
      router.push(data.bondStatus === "blocked" ? "/submit/bond" : "/submit/interview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-lg mx-auto card p-6 sm:p-8 space-y-4">
      <div className="font-mono text-[11px] text-text-muted">{"// recover_session"}</div>
      <h1 className="text-xl font-bold text-text-primary">Recover a session</h1>
      <p className="text-sm text-text-secondary">
        Enter the recovery code shown after verification. It issues a fresh session token and invalidates
        the old one. Interview messages are not recovered because they are never stored on the server.
      </p>
      <label className="block text-xs text-text-secondary">
        Recovery code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full bg-bg-elevated border border-border rounded px-3 py-2 text-sm font-mono text-text-primary"
        />
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={busy || code.trim().length < 16} className="btn-primary w-full disabled:opacity-50">
        {busy ? "Recovering" : "Recover"}
      </button>
    </form>
  );
}
