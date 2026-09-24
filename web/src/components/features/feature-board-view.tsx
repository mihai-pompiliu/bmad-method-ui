"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight, CircleHelp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshRepoButton } from "@/components/shared/refresh-repo-button";
import { featureI18n } from "@/lib/features/i18n.ru";
import { featureLibraryPath, formatFeatureReadAt } from "@/lib/features/presentation";
import type { Feature, FeatureBoard, StepId } from "@/lib/features";
import { FeatureStateMark, FeatureStatusPill, FeatureStepIndicator } from "./feature-step-indicator";

const phaseHeaders = [
  { label: featureI18n.board.phases.definition, start: 2, span: 3 },
  { label: featureI18n.board.phases.development, start: 5, span: 3 },
  { label: featureI18n.board.phases.release, start: 8, span: 2 },
] as const;

const stepIds: StepId[] = [
  "owner-input",
  "analyst",
  "mockup",
  "plan",
  "code",
  "github",
  "test",
  "production",
];

function featureHref(owner: string, repo: string, slug: string): string {
  return `/repo/${owner}/${repo}/features/${encodeURIComponent(slug)}`;
}

function OwnerQuestions({
  questions,
  owner,
  repo,
}: {
  questions: FeatureBoard["openQuestions"];
  owner: string;
  repo: string;
}) {
  const [open, setOpen] = useState(false);
  if (questions.length === 0) return null;

  return (
    <section className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3" aria-labelledby="owner-questions-title">
      <div className="flex flex-wrap items-center gap-3">
        <span id="owner-questions-title" className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-background/40 px-2.5 py-1 text-xs font-medium text-warning">
          <CircleHelp aria-hidden="true" className="size-3.5" />
          {featureI18n.board.ownerQuestions} · {questions.length}
        </span>
        <p className="min-w-0 flex-1 text-sm text-foreground">{questions.map((question) => question.question).join(" ")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
          {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          {featureI18n.board.viewQuestions}
        </Button>
      </div>
      {open && (
        <div className="mt-4 grid gap-3 border-t border-warning/30 pt-4">
          {questions.map((question) => {
            const source = featureLibraryPath(question.source);
            return (
              <article key={question.id} className="rounded-md border border-border bg-card p-3 text-sm">
                <p className="font-medium">{question.question}</p>
                <dl className="mt-3 grid gap-2 text-muted-foreground">
                  <div><dt className="font-medium text-foreground">{featureI18n.board.questionWhy}</dt><dd>{question.why}</dd></div>
                  <div><dt className="font-medium text-foreground">{featureI18n.board.questionYes}</dt><dd>{question.ifYes}</dd></div>
                  <div><dt className="font-medium text-foreground">{featureI18n.board.questionNo}</dt><dd>{question.ifNo}</dd></div>
                </dl>
                {source ? (
                  <Link className="mt-3 inline-flex items-center gap-1 text-xs text-info hover:underline" href={`/repo/${owner}/${repo}/docs?file=${encodeURIComponent(source)}`}>
                    <FileText aria-hidden="true" className="size-3.5" />
                    {featureI18n.board.openSource}
                  </Link>
                ) : <p className="mt-3 text-xs text-muted-foreground">{featureI18n.board.externalDocument}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FeatureRow({ feature, owner, repo }: { feature: Feature; owner: string; repo: string }) {
  const router = useRouter();
  const href = featureHref(owner, repo, feature.slug);
  const open = () => router.push(href);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  };

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKeyDown}
      className="feature-board-grid feature-board-row cursor-pointer border-t border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${feature.title}: ${feature.now.status}`}
    >
      <div role="cell" className="sticky left-0 z-10 bg-card px-4 py-5">
        <p className="font-semibold leading-5">{feature.title}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">{feature.summary}</p>
      </div>
      {feature.steps.map((item, index) => (
        <div role="cell" key={item.id} className="relative min-w-0 px-2 py-5">
          {index < feature.steps.length - 1 && (
            <span aria-hidden="true" className={`absolute left-5 right-0 top-7 h-px ${item.state === "done" && feature.steps[index + 1]?.state === "done" ? "bg-success/70" : "bg-border"}`} />
          )}
          <FeatureStepIndicator step={item} />
        </div>
      ))}
      <div role="cell" className="border-l border-border px-4 py-5">
        <FeatureStatusPill status={feature.now.status} />
        <p className="mt-3 text-sm leading-5 text-foreground">{feature.now.reason}</p>
        {feature.now.next && <p className="mt-2 text-xs font-medium text-info">{featureI18n.board.next}: {feature.now.next}</p>}
      </div>
    </div>
  );
}

function MobileFeatureList({ features, owner, repo }: { features: Feature[]; owner: string; repo: string }) {
  return (
    <div className="grid gap-3 sm:hidden">
      {features.map((feature) => (
        <Link key={feature.slug} href={featureHref(owner, repo, feature.slug)} className="rounded-lg border border-border bg-card p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{feature.title}</h2><p className="mt-1 text-xs text-muted-foreground">{feature.summary}</p></div><FeatureStatusPill status={feature.now.status} /></div>
          <div className="mt-4 grid gap-3 border-t border-border pt-4">
            {feature.steps.map((item) => <div key={item.id} className="feature-mobile-step-grid gap-3"><p className="text-xs text-muted-foreground">{featureI18n.steps[item.id]}</p><FeatureStepIndicator step={item} compact /></div>)}
          </div>
          {feature.now.next && <p className="mt-4 text-xs font-medium text-info">{featureI18n.board.next}: {feature.now.next}</p>}
        </Link>
      ))}
    </div>
  );
}

export function FeatureBoardView({ board, owner, repo, displayName }: { board: FeatureBoard; owner: string; repo: string; displayName: string }) {
  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight">{featureI18n.board.title} · {displayName}</h1></div>
        <div className="flex items-center gap-3"><p className="text-xs text-muted-foreground">{featureI18n.board.data} {formatFeatureReadAt(board.readAt)}</p><RefreshRepoButton owner={owner} name={repo} showLabel label={featureI18n.board.refresh} messages={featureI18n.board.refreshMessages} /></div>
      </header>

      <OwnerQuestions questions={board.openQuestions} owner={owner} repo={repo} />

      {board.features.length === 0 ? (
        <Card className="p-8 text-center"><p className="font-medium">{featureI18n.board.noFeatures}</p><p className="mt-1 text-sm text-muted-foreground">{featureI18n.board.noFeaturesDescription}</p></Card>
      ) : (
        <>
          <div role="table" aria-label={featureI18n.board.title} className="hidden overflow-x-auto rounded-lg border border-border bg-card sm:block">
            <div className="feature-board-grid border-b border-border bg-muted/40 px-4 py-3">
              <div />
              {phaseHeaders.map((phase) => <div key={phase.label} className="border-t-2 border-border pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground" style={{ gridColumn: `${phase.start} / span ${phase.span}` }}>{phase.label}</div>)}
              <div />
            </div>
            <div role="row" className="feature-board-grid border-b border-border bg-muted/20">
              <div role="columnheader" className="sticky left-0 z-10 bg-muted px-4 py-3 text-xs font-medium text-muted-foreground" />
              {stepIds.map((id) => <div key={id} role="columnheader" className="px-2 py-3 text-xs font-medium leading-4 text-muted-foreground">{featureI18n.steps[id]}</div>)}
              <div role="columnheader" className="border-l border-border px-4 py-3 text-xs font-medium text-muted-foreground">{featureI18n.board.now}</div>
            </div>
            {board.features.map((feature) => <FeatureRow key={feature.slug} feature={feature} owner={owner} repo={repo} />)}
          </div>
          <MobileFeatureList features={board.features} owner={owner} repo={repo} />
          <section aria-labelledby="feature-legend" className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <h2 id="feature-legend" className="sr-only">{featureI18n.board.legend}</h2>
            {Object.entries(featureI18n.states).map(([state, label]) => <span key={state} className="inline-flex items-center gap-1.5"><FeatureStateMark state={state as keyof typeof featureI18n.states} />{label}</span>)}
          </section>
        </>
      )}
    </div>
  );
}
