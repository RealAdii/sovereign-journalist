import type { VerifiedCredential } from "@/lib/types";

interface Props {
  credential: VerifiedCredential;
  size?: "sm" | "md";
}

export default function CredentialBadge({ credential, size = "sm" }: Props) {
  const label = Object.values(credential.parameters).join(" · ") || credential.provider;
  const isSm = size === "sm";

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded border border-neon-green/20 bg-neon-green/5 ${
        isSm ? "px-2 py-0.5" : "px-3 py-1"
      }`}
    >
      <div
        className={`rounded-full bg-neon-green shadow-[0_0_6px_#00FF88] ${
          isSm ? "w-1.5 h-1.5" : "w-2 h-2"
        }`}
      />
      <span
        className={`font-mono text-neon-green ${
          isSm ? "text-[10px]" : "text-xs"
        }`}
      >
        verified: {label}
      </span>
    </div>
  );
}
