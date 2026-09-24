import {
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDotDashed,
  CircleHelp,
  CircleSlash2,
  CircleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFeatureDate } from "@/lib/features/presentation";
import { featureI18n } from "@/lib/features/i18n.ru";
import type { FeatureStep, StepState } from "@/lib/features";

const stateStyles: Record<StepState, { className: string; Icon: typeof Circle }> = {
  done: { className: "text-success", Icon: CheckCircle2 },
  partial: { className: "text-info", Icon: CircleDotDashed },
  check: { className: "text-warning", Icon: CircleAlert },
  previous: { className: "text-muted-foreground", Icon: Circle },
  none: { className: "text-muted-foreground/70", Icon: CircleSlash2 },
  "not-started": { className: "text-muted-foreground", Icon: CircleDashed },
  unknown: { className: "text-muted-foreground", Icon: CircleHelp },
};

export function FeatureStateMark({ state, className }: { state: StepState; className?: string }) {
  const { Icon, className: stateClass } = stateStyles[state];
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0", stateClass, className)} />;
}

export function FeatureStatusPill({ status }: { status: string }) {
  const style = status === featureI18n.now.inProduction
    ? "border-success/40 bg-success/10 text-success"
    : status === featureI18n.now.onTest || status === featureI18n.now.readyForTest
      ? "border-info/40 bg-info/10 text-info"
      : status === featureI18n.now.needsCheck
        ? "border-warning/40 bg-warning/10 text-warning"
        : status === featureI18n.now.stopped
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground";
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", style)}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{status}</span>;
}

export function FeatureStepIndicator({ step, compact = false }: { step: FeatureStep; compact?: boolean }) {
  const date = formatFeatureDate(step.date);
  return (
    <div className={cn("group/feature-step relative min-w-0", compact ? "flex items-start gap-2" : "grid gap-1")}>
      <FeatureStateMark state={step.state} className={compact ? "mt-0.5" : "size-5"} />
      <div className="min-w-0">
        <p className={cn("break-words text-xs font-medium leading-4", step.state === "none" || step.state === "not-started" ? "text-muted-foreground" : "text-foreground")}>{step.label}</p>
        {date && <time dateTime={step.date ?? undefined} className="font-mono text-xs text-muted-foreground">{date}</time>}
        <p className="sr-only">{featureI18n.states[step.state]}</p>
      </div>
      <div role="tooltip" className="pointer-events-none absolute z-30 hidden w-64 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md group-hover/feature-step:block">
        <p>{step.reason}</p>
        {step.sourcePaths.length > 0 && <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{step.sourcePaths.join("\n")}</p>}
      </div>
    </div>
  );
}
