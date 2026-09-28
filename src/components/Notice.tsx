interface Props {
  tone: "info" | "warn" | "error" | "ok";
  title?: string;
  children: React.ReactNode;
}

const tones = {
  info: "bg-neon-cyan/5 text-text-secondary border-neon-cyan/20",
  warn: "bg-warning/5 text-text-secondary border-warning/30",
  error: "bg-error/5 text-error border-error/20",
  ok: "bg-neon-green/5 text-text-secondary border-neon-green/20",
};

export default function Notice({ tone, title, children }: Props) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded border px-3 py-2 text-xs text-left ${tones[tone]}`}>
      {title && <div className="font-mono text-[10px] uppercase tracking-wider mb-1 opacity-80">{title}</div>}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
