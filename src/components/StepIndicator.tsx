interface Props {
  currentStep: 1 | 2 | 3 | 4;
}

const steps = [
  { num: 1, label: "Verify" },
  { num: 2, label: "Bond" },
  { num: 3, label: "Interview" },
  { num: 4, label: "Publish" },
];

export default function StepIndicator({ currentStep }: Props) {
  return (
    <ol className="flex flex-wrap items-center justify-center gap-2 mb-8" aria-label="Submission steps">
      {steps.map((step, i) => {
        const isActive = step.num === currentStep;
        const isCompleted = step.num < currentStep;
        return (
          <li key={step.num} className="flex items-center gap-2" aria-current={isActive ? "step" : undefined}>
            <div className="flex items-center gap-1.5">
              <div
                aria-hidden="true"
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                  isActive
                    ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
                    : isCompleted
                      ? "bg-neon-green/10 text-neon-green/60 border border-neon-green/20"
                      : "bg-bg-elevated text-text-muted border border-border"
                }`}
              >
                {isCompleted ? "✓" : step.num}
              </div>
              <span
                className={`font-mono text-[11px] uppercase tracking-wider ${
                  isActive ? "text-neon-green" : isCompleted ? "text-neon-green/50" : "text-text-muted"
                }`}
              >
                {step.label}
                {isCompleted && <span className="sr-only"> (completed)</span>}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div aria-hidden="true" className={`w-6 sm:w-8 h-px ${isCompleted ? "bg-neon-green/30" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
