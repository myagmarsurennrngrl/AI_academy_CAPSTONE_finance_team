const STEPS = [
  { n: "01", label: "Upload" },
  { n: "02", label: "Validate" },
  { n: "03", label: "Analyze" },
  { n: "04", label: "AI Insight" },
  { n: "05", label: "Result" },
];

export function ProcessSteps() {
  return (
    <div className="mx-auto flex max-w-2xl items-center justify-between">
      {STEPS.map((step, i) => (
        <div key={step.n} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-300 bg-white/80 text-xs font-semibold text-ink-600 shadow-subtle">
              {step.n}
            </div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && <div className="mx-1 h-px flex-1 bg-ink-200" />}
        </div>
      ))}
    </div>
  );
}
