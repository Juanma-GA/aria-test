import { useEffect, useState } from 'react';

interface Step {
  text: string;
  startPercent: number;
  endPercent: number;
}

interface ProgressIndicatorProps {
  steps: Step[];
  completionTimeMs?: number; // default 30000
  showBar?: boolean; // show progress bar (default false for modal, true for report)
}

export function ProgressIndicator({ steps, completionTimeMs = 30000, showBar = false }: ProgressIndicatorProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - startTime;
      const pct = Math.min(100, (elapsed / completionTimeMs) * 100);

      setElapsedMs(elapsed);
      setProgress(pct);

      // Cycle through steps based on progress
      let stepIdx = 0;
      for (let i = steps.length - 1; i >= 0; i--) {
        if (pct >= steps[i].startPercent) {
          stepIdx = i;
          break;
        }
      }
      setCurrentStepIndex(stepIdx);

      if (elapsed >= completionTimeMs) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [steps, completionTimeMs]);

  const currentStep = steps[currentStepIndex];
  const displayProgress = Math.round(progress);

  if (showBar) {
    // For audit-report: show progress bar with percentage
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text font-medium">{currentStep.text}</span>
          <span className="text-sm font-mono font-bold text-blue-aria">{displayProgress}%</span>
        </div>
        <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-blue-aria h-full transition-all duration-100 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // For modal: show step text only (animated cycling)
  return (
    <span className="animate-pulse">
      {currentStep.text}
    </span>
  );
}
