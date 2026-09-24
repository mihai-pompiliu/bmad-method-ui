import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { featureI18n } from "@/lib/features/i18n.ru";
import { featureLibraryPath, formatFeatureDate, formatFeatureReadAt } from "@/lib/features/presentation";
import type { Feature, FeatureStep } from "@/lib/features";
import { FeatureStateMark, FeatureStatusPill } from "./feature-step-indicator";

function libraryHref(owner: string, repo: string, source: string | null | undefined): string | null {
  const path = featureLibraryPath(source);
  return path ? `/repo/${owner}/${repo}/docs?file=${encodeURIComponent(path)}` : null;
}

function SourceLink({ owner, repo, source, label }: { owner: string; repo: string; source: string | null | undefined; label: string }) {
  const href = libraryHref(owner, repo, source);
  if (!href) return <p className="text-xs text-muted-foreground">{featureI18n.card.external}</p>;
  return <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"><FileText aria-hidden="true" className="size-3.5" />{label}</Link>;
}

function StepRow({ title, step }: { title: string; step: FeatureStep }) {
  return (
    <div className="feature-code-row">
      <p className="font-medium text-muted-foreground">{title}</p>
      <p className="min-w-0 text-sm">{step.label}</p>
      <span className="inline-flex items-center justify-end gap-1.5 text-xs text-muted-foreground"><FeatureStateMark state={step.state} />{step.state === "done" ? "" : step.label}</span>
    </div>
  );
}

function ProductionServers({ feature }: { feature: Feature }) {
  if (feature.productionServers.length === 0) return null;

  return (
    <ul className="mt-3 grid gap-2 border-t border-border pt-3 text-xs" aria-label={featureI18n.card.production}>
      {feature.productionServers.map((server) => {
        const release = feature.releases
          .filter((item) => item.environment === "prod" && item.server === server.id)
          .sort((left, right) => right.date.localeCompare(left.date))[0];
        return (
          <li key={server.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="font-medium">{server.name}</span>
            <span className="font-mono text-muted-foreground">
              {release ? `${release.version} · ${eventDate(release.date)}` : featureI18n.card.serverWithoutRelease}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function eventDate(date: string | null): string {
  return formatFeatureDate(date) ?? "—";
}

function sourceFileName(source: string): string {
  const normalized = source.replaceAll("\\", "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? source;
}

function FeatureTimeline({ feature }: { feature: Feature }) {
  const rawEvents: Array<{ date: string | null; title: string; detail: string }> = [
    ...feature.ownerInput.filter((source) => source.date).map((source) => ({ date: source.date, title: source.kind === "mockup" ? featureI18n.card.ownerInput : featureI18n.card.source, detail: sourceFileName(source.rawPath) })),
    ...(feature.analystAudit?.date ? [{ date: feature.analystAudit.date, title: featureI18n.card.analyst, detail: sourceFileName(feature.analystAudit.path) }] : []),
    ...(feature.spec.created ? [{ date: feature.spec.created, title: featureI18n.card.fixed, detail: feature.spec.id }] : []),
    ...(feature.epic?.date ? [{ date: feature.epic.date, title: featureI18n.card.epic, detail: feature.epic.title }] : []),
    ...feature.releases.map((release) => ({ date: release.date, title: release.environment === "test" ? featureI18n.card.test : featureI18n.card.production, detail: release.version })),
  ];
  const events: Array<{ date: string | null; title: string; detail: string }> = rawEvents.filter((event): event is { date: string; title: string; detail: string } => Boolean(event.date))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-6);
  events.push({ date: null, title: featureI18n.card.timelineCurrent, detail: feature.now.status });

  return (
    <section aria-labelledby="feature-path"><h2 id="feature-path" className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{featureI18n.card.path}</h2>
      <ol className="feature-timeline">
        {events.map((event, index) => <li key={`${event.title}-${event.date ?? "current"}-${index}`} className="relative min-w-36 pr-4"><span aria-hidden="true" className={`mb-2 block size-4 rounded-full ${event.date ? "bg-muted-foreground" : "border-2 border-warning"}`} /><time className="font-mono text-xs text-muted-foreground">{eventDate(event.date)}</time><p className="mt-1 text-sm font-medium">{event.title}</p><p className="mt-1 text-xs leading-4 text-muted-foreground">{event.detail}</p></li>)}
      </ol>
    </section>
  );
}

function DefinitionCard({ children, title, date, owner, repo, source, openLabel }: { children: React.ReactNode; title: string; date?: string | null; owner: string; repo: string; source?: string | null; openLabel?: string }) {
  return <Card className="grid content-start gap-3 p-4"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{title}</h2>{date && <time dateTime={date} className="font-mono text-xs text-muted-foreground">{formatFeatureDate(date)}</time>}</div>{children}{source && <div className="mt-auto pt-2"><SourceLink owner={owner} repo={repo} source={source} label={openLabel ?? featureI18n.card.open} /></div>}</Card>;
}

export function FeatureCardView({ feature, owner, repo, readAt }: { feature: Feature; owner: string; repo: string; readAt: string }) {
  const step = (id: FeatureStep["id"]) => {
    const value = feature.steps.find((item) => item.id === id);
    if (!value) throw new Error(`Missing feature step ${id}`);
    return value;
  };
  const hasArchitecture = feature.spec.companions.some((companion) => companion.toLowerCase().includes("architecture"));
  const sources = feature.ownerInput;
  const mockupSource = sources.find((source) => source.kind === "mockup" && source.path)
    ?? sources.find((source) => source.path)
    ?? sources[0];
  const approval = feature.config.mockupApproval;

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href={`/repo/${owner}/${repo}/features`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-3.5" />{featureI18n.card.allFeatures}</Link><h1 className="mt-2 text-3xl font-bold tracking-tight">{feature.title}</h1></div>
        <div className="flex flex-wrap items-center justify-end gap-3"><Link href={`/repo/${owner}/${repo}/docs`} className="text-xs font-medium text-info hover:underline">{featureI18n.card.documents}</Link><span className="font-mono text-xs text-muted-foreground">{feature.spec.id}</span><FeatureStatusPill status={feature.now.status} /><span className="text-xs text-muted-foreground">{featureI18n.board.data} {formatFeatureReadAt(readAt)}</span></div>
      </header>

      <section aria-labelledby="feature-definition"><h2 id="feature-definition" className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{featureI18n.board.phases.definition}</h2>
        <div className="feature-definition-grid">
          <DefinitionCard title={featureI18n.card.ownerInput} date={mockupSource?.date} owner={owner} repo={repo} source={mockupSource?.path} openLabel={featureI18n.card.openMockup}>
            {sources.length > 0 ? <ul className="grid gap-2 text-sm leading-5">{sources.map((source) => <li key={source.rawPath} title={source.rawPath}>{sourceFileName(source.rawPath)}{source.external && <p className="mt-1 text-xs text-muted-foreground">{featureI18n.card.external}</p>}</li>)}</ul> : <p className="text-sm text-muted-foreground">{featureI18n.card.noOwnerInput}</p>}
          </DefinitionCard>
          <ArrowRight aria-hidden="true" className="feature-definition-arrow size-5 text-muted-foreground" />
          <DefinitionCard title={featureI18n.card.analyst} date={feature.analystAudit?.date} owner={owner} repo={repo} source={feature.analystAudit?.path}>
            {feature.analystAudit ? <p className="text-sm leading-5">{feature.config.analystVerdict ?? step("analyst").label}</p> : <p className="text-sm text-muted-foreground">{featureI18n.card.noAnalyst}</p>}
          </DefinitionCard>
          <ArrowRight aria-hidden="true" className="feature-definition-arrow size-5 text-muted-foreground" />
          <DefinitionCard title={featureI18n.card.fixed} date={feature.epic?.date ?? feature.spec.created} owner={owner} repo={repo} source={feature.spec.path}>
            <ul className="grid gap-2 text-sm leading-5"><li>{featureI18n.card.requirements}: {feature.spec.capabilities.length}</li><li>{hasArchitecture ? featureI18n.card.architecture : featureI18n.card.noArchitecture}</li><li>{feature.epic ? `${featureI18n.card.epic} ${feature.epic.id}: ${feature.epic.stories.length} ${featureI18n.card.stories}` : featureI18n.card.noEpic}</li><li>{featureI18n.card.mockupStatus}: {step("mockup").label}</li></ul>
          </DefinitionCard>
        </div>
      </section>

      <FeatureTimeline feature={feature} />

      <div className="feature-card-bottom">
        <Card className="p-4"><h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{featureI18n.card.code}</h2><div className="mt-3"><StepRow title={featureI18n.card.codeWritten} step={step("code")} /><StepRow title={featureI18n.card.github} step={step("github")} /><StepRow title={featureI18n.card.test} step={step("test")} /><StepRow title={featureI18n.card.production} step={step("production")} /><ProductionServers feature={feature} /></div></Card>
        <div className="grid gap-4"><Card className="p-4"><h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{featureI18n.card.decisions}</h2><div className="mt-3 grid gap-3">{approval && <div className="border-b border-border pb-3"><p className="text-sm font-medium">{featureI18n.card.ownerApproval}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{approval.source} · {formatFeatureDate(approval.date)}</p></div>}{feature.questions.map((question) => <div key={question.id}><p className="text-sm font-medium">{question.question}</p><p className="mt-1 text-xs text-muted-foreground">{question.status === "open" ? featureI18n.card.opened : featureI18n.card.answered} · {formatFeatureDate(question.opened)} · {question.why}</p></div>)}{!approval && feature.questions.length === 0 && <p className="text-sm text-muted-foreground">{featureI18n.card.noDecision}</p>}</div></Card>
          <Card className="border-info/40 bg-info/10 p-4"><h2 className="text-xs font-medium uppercase tracking-wide text-info">{featureI18n.card.nextStep}</h2><p className="mt-2 text-sm font-medium leading-5">{feature.now.next ?? featureI18n.card.noNextStep}</p><p className="mt-2 text-xs text-muted-foreground">{feature.now.reason}</p></Card>
        </div>
      </div>
    </div>
  );
}
