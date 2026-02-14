interface Props {
  currentStep: 1 | 2 | 3;
}

const steps = [
  { num: 1, label: "Verify" },
  { num: 2, label: "Interview" },
  { num: 3, label: "Publish" },
];

export default function StepIndicator({ currentStep }: Props) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, i) => {
        const isActive = step.num === currentStep;
        const isCompleted = step.num < currentStep;

        return (
          <div key={step.num} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                  isActive
                    ? "bg-neon-green/20 text-neon-green border border-neon-green/40 shadow-[0_0_8px_rgba(0,255,136,0.2)]"
                    : isCompleted
                      ? "bg-neon-green/10 text-neon-green/60 border border-neon-green/20"
                      : "bg-bg-elevated text-text-muted border border-border"
                }`}
              >
                {isCompleted ? "\u2713" : step.num}
              </div>
              <span
                className={`font-mono text-[11px] uppercase tracking-wider ${
                  isActive
                    ? "text-neon-green"
                    : isCompleted
                      ? "text-neon-green/50"
                      : "text-text-muted"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-8 h-px ${
                  isCompleted ? "bg-neon-green/30" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
