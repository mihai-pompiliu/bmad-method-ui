import { featureI18n } from "./i18n.ru";
import type {
  FeatureComputationInput,
  FeatureStep,
  Release,
  StepId,
  StepState,
} from "./types";

function makeStep(
  id: StepId,
  state: StepState,
  label: string,
  reason: string,
  sourcePaths: string[] = [],
  date: string | null = null,
): FeatureStep {
  return { id, state, label, reason, sourcePaths, date };
}

function featureConfig(input: FeatureComputationInput) {
  return input.config.features[input.spec.slug] ?? {};
}

function formatStories(count: number): string {
  return featureI18n.computed.stories(count);
}

function latestRelease(releases: Release[]): Release | null {
  return [...releases].sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
}

function sourceKindLabel(kind: FeatureComputationInput["ownerInput"][number]["kind"]): string {
  if (kind === "mockup") return featureI18n.computed.ownerInput.mockup;
  if (kind === "ux") return featureI18n.computed.ownerInput.prototype;
  return featureI18n.computed.ownerInput.description;
}

function isCurrentIteration(release: Release, created: string | null): boolean | null {
  if (!created) return null;
  return release.date >= created;
}

function computeOwnerInput(input: FeatureComputationInput): FeatureStep {
  const id: StepId = "owner-input";
  if (input.ownerInput.length === 0) {
    return makeStep(id, "none", featureI18n.computed.ownerInput.noSource.label, featureI18n.computed.ownerInput.noSource.reason, [input.spec.path]);
  }

  const readable = input.ownerInput.find((source) => source.exists && source.kind === "mockup")
    ?? input.ownerInput.find((source) => source.exists);
  if (!readable) {
    return makeStep(
      id,
      "unknown",
      featureI18n.computed.ownerInput.unreadable.label,
      featureI18n.computed.ownerInput.unreadable.reason,
      input.ownerInput.map((source) => source.path ?? source.rawPath),
    );
  }

  const label = featureConfig(input).ownerInput?.label ?? sourceKindLabel(readable.kind);
  return makeStep(
    id,
    "done",
    label,
    readable.external
      ? featureI18n.computed.ownerInput.external
      : featureI18n.computed.ownerInput.declared,
    input.ownerInput.map((source) => source.path ?? source.rawPath),
    readable.date,
  );
}

function computeAnalyst(input: FeatureComputationInput): FeatureStep {
  const id: StepId = "analyst";
  if (!input.analystAudit) {
    return makeStep(id, "none", featureI18n.computed.analyst.none.label, featureI18n.computed.analyst.none.reason, [input.spec.path]);
  }
  if (input.analystAudit.unreadable || !input.analystAudit.date) {
    return makeStep(
      id,
      "unknown",
      featureI18n.computed.analyst.unreadable.label,
      featureI18n.computed.analyst.unreadable.reason,
      [input.analystAudit.path],
    );
  }
  const configured = featureConfig(input).analystVerdict;
  return makeStep(
    id,
    "done",
    configured ?? featureI18n.computed.analyst.label(formatShortDate(input.analystAudit.date)),
    featureI18n.computed.analyst.declared,
    [input.analystAudit.path],
    input.analystAudit.date,
  );
}

function computeMockup(input: FeatureComputationInput): FeatureStep {
  const id: StepId = "mockup";
  const approval = featureConfig(input).mockupApproval;
  const evidence = input.mockup;
  const paths = [evidence.sourcePath, approval ? "_bmad-output/feature-board.yaml" : null].filter((value): value is string => Boolean(value));

  if (!evidence.exists) {
    return makeStep(id, "none", featureI18n.computed.mockup.none.label, featureI18n.computed.mockup.none.reason, [input.spec.path]);
  }
  if (evidence.status === "final") {
    return makeStep(id, "done", featureI18n.computed.mockup.approved, featureI18n.computed.mockup.finalReason, paths, approval?.date ?? null);
  }
  if (evidence.status === "draft") {
    if (approval) {
      return makeStep(
        id,
        "check",
        featureI18n.computed.mockup.conflictLabel,
        featureI18n.computed.mockup.conflictReason,
        paths,
        approval.date,
      );
    }
    return makeStep(id, "partial", featureI18n.computed.mockup.draft, featureI18n.computed.mockup.draftReason, paths, null);
  }
  return makeStep(
    id,
    "unknown",
    featureI18n.computed.mockup.unreadable,
    evidence.unreadable
      ? featureI18n.computed.mockup.externalReason
      : featureI18n.computed.mockup.missingStatusReason,
    paths,
    approval?.date ?? null,
  );
}

function computePlan(input: FeatureComputationInput): FeatureStep {
  const id: StepId = "plan";
  if (input.epic && input.epic.stories.length > 0) {
    return makeStep(
      id,
      "done",
      formatStories(input.epic.stories.length),
      featureI18n.computed.plan.doneReason,
      [input.spec.path, input.epic.path],
      input.epic.date,
    );
  }
  return makeStep(
    id,
    "partial",
    featureI18n.computed.plan.partialLabel,
    featureI18n.computed.plan.partialReason,
    [input.spec.path],
    input.spec.created,
  );
}

function computeCode(input: FeatureComputationInput): FeatureStep {
  const id: StepId = "code";
  if (!input.epic) {
    return makeStep(id, "none", featureI18n.computed.code.notStarted, featureI18n.computed.code.noEpic, [input.spec.path]);
  }
  if (!input.sprintStatusAvailable) {
    return makeStep(id, "unknown", featureI18n.computed.code.unreadable.label, featureI18n.computed.code.unreadable.reason, [input.epic.path]);
  }

  const storyIds = new Set(input.epic.stories.map((story) => story.id));
  const stories = input.sprintStories.filter((story) => storyIds.has(story.id));
  const sources = [input.epic.path, "_bmad-output/implementation-artifacts/sprint-status.yaml"];
  if (stories.length === 0) {
    return makeStep(id, "none", featureI18n.computed.code.notStarted, featureI18n.computed.code.absentFromSprint, sources);
  }

  const inProgress = stories.find((story) => story.status === "in-progress");
  if (inProgress) return makeStep(id, "partial", featureI18n.computed.code.inProgress(inProgress.id), featureI18n.computed.code.inProgressReason(inProgress.id), sources);
  const review = stories.find((story) => story.status === "review");
  if (review) return makeStep(id, "partial", featureI18n.computed.code.review(review.id), featureI18n.computed.code.reviewReason(review.id), sources);

  const completed = stories.filter((story) => story.status === "done").length;
  if (completed === input.epic.stories.length) {
    return makeStep(id, "done", featureI18n.computed.code.allDone(formatStories(input.epic.stories.length)), featureI18n.computed.code.allDoneReason, sources);
  }
  if (completed > 0) {
    return makeStep(id, "partial", featureI18n.computed.code.partial(completed, input.epic.stories.length), featureI18n.computed.code.partialReason, sources);
  }
  return makeStep(id, "none", featureI18n.computed.code.notStarted, featureI18n.computed.code.unstartedReason, sources);
}

function computeGithub(input: FeatureComputationInput): FeatureStep {
  const id: StepId = "github";
  const repos = featureConfig(input).repos ?? input.config.defaults.repos;
  if (repos.length === 0) {
    return makeStep(id, "unknown", featureI18n.computed.github.repositoriesMissing.label, featureI18n.computed.github.repositoriesMissing.reason, ["_bmad-output/feature-board.yaml"]);
  }
  if (input.github.access === "unavailable") {
    return makeStep(id, "unknown", featureI18n.computed.github.unavailable, input.github.error ?? featureI18n.computed.github.unavailableReason, repos);
  }
  const openPr = input.github.pullRequests.find((pr) => pr.state === "open");
  if (openPr) return makeStep(id, "partial", featureI18n.computed.github.openPr(openPr.number), featureI18n.computed.github.openPrReason(openPr.number), repos);
  if (input.github.matchingBranches.length > 0) {
    const branch = input.github.matchingBranches[0];
    return makeStep(id, "partial", featureI18n.computed.github.branch(branch), featureI18n.computed.github.branchReason(branch), repos);
  }
  if (input.github.pullRequests.length > 0 && input.github.pullRequests.every((pr) => pr.merged && pr.base === "main")) {
    return makeStep(id, "done", featureI18n.computed.github.main, featureI18n.computed.github.mainReason, repos);
  }
  const latest = latestRelease(input.releases.filter((release) => release.feature === input.spec.slug));
  if (latest) {
    return makeStep(id, "previous", featureI18n.computed.github.previous(latest.version), featureI18n.computed.github.previousReason, [latest.sourcePath ?? "_bmad-output/releases.yaml"]);
  }
  return makeStep(id, "none", featureI18n.computed.github.none, featureI18n.computed.github.noneReason, repos);
}

function computeTest(input: FeatureComputationInput): FeatureStep {
  const id: StepId = "test";
  const latest = latestRelease(input.releases.filter((release) => release.feature === input.spec.slug && release.environment === "test"));
  if (!latest) return makeStep(id, "none", featureI18n.computed.test.none.label, featureI18n.computed.test.none.reason, ["_bmad-output/releases.yaml"]);
  const current = isCurrentIteration(latest, input.spec.created);
  if (current === null) return makeStep(id, "unknown", featureI18n.computed.test.dateUnknown.label, featureI18n.computed.test.dateUnknown.reason, [input.spec.path, latest.sourcePath ?? "_bmad-output/releases.yaml"]);
  const configuration = featureConfig(input);
  if (!current) {
    const note = configuration.previousNote ? ` · ${configuration.previousNote}` : "";
    return makeStep(id, "previous", featureI18n.computed.test.previous(latest.version, note), featureI18n.computed.test.previousReason, [latest.sourcePath ?? "_bmad-output/releases.yaml"], latest.date);
  }
  return latest.verified
    ? makeStep(id, "done", featureI18n.computed.test.verified(latest.version), featureI18n.computed.test.verifiedReason, [latest.sourcePath ?? "_bmad-output/releases.yaml"], latest.date)
    : makeStep(id, "check", featureI18n.computed.test.unverified(latest.version), featureI18n.computed.test.unverifiedReason, [latest.sourcePath ?? "_bmad-output/releases.yaml"], latest.date);
}

function computeProduction(input: FeatureComputationInput): FeatureStep {
  const id: StepId = "production";
  const servers = input.config.environments.prod.servers;
  if (servers.length === 0) return makeStep(id, "not-started", featureI18n.computed.production.serversMissing.label, featureI18n.computed.production.serversMissing.reason, ["_bmad-output/feature-board.yaml"]);
  const production = input.releases.filter((release) => release.feature === input.spec.slug && release.environment === "prod");
  if (production.length === 0) return makeStep(id, "none", featureI18n.computed.production.none.label, featureI18n.computed.production.none.reason, ["_bmad-output/releases.yaml"]);
  if (!input.spec.created) return makeStep(id, "unknown", featureI18n.computed.production.dateUnknown.label, featureI18n.computed.production.dateUnknown.reason, [input.spec.path, "_bmad-output/releases.yaml"]);
  const iterationStart = input.spec.created;

  const newestByServer = servers.map((server) => ({
    server,
    release: latestRelease(production.filter((release) => release.server === server.id)),
  }));
  const current = newestByServer.filter((entry) => entry.release && entry.release.date >= iterationStart);
  if (current.length === servers.length) {
    const latest = latestRelease(current.flatMap((entry) => entry.release ? [entry.release] : []));
    return makeStep(id, "done", featureI18n.computed.production.allServers(servers.length), featureI18n.computed.production.allServersReason, ["_bmad-output/releases.yaml"], latest?.date ?? null);
  }
  if (current.length > 0) {
    const latest = latestRelease(current.flatMap((entry) => entry.release ? [entry.release] : []));
    return makeStep(id, "partial", featureI18n.computed.production.partialServers(current.length, servers.length), featureI18n.computed.production.partialServersReason, ["_bmad-output/releases.yaml"], latest?.date ?? null);
  }
  if (newestByServer.some((entry) => entry.release)) {
    const latest = latestRelease(newestByServer.flatMap((entry) => entry.release ? [entry.release] : []));
    return makeStep(id, "previous", featureI18n.computed.production.previous, featureI18n.computed.production.previousReason, ["_bmad-output/releases.yaml"], latest?.date ?? null);
  }
  return makeStep(id, "none", featureI18n.computed.production.none.label, featureI18n.computed.production.noConfiguredServers, ["_bmad-output/releases.yaml"]);
}

export function formatShortDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}` : date;
}

/** Pure implementation of the eight rules in feature-board specification section 7. */
export function computeFeatureSteps(input: FeatureComputationInput): FeatureStep[] {
  return [
    computeOwnerInput(input),
    computeAnalyst(input),
    computeMockup(input),
    computePlan(input),
    computeCode(input),
    computeGithub(input),
    computeTest(input),
    computeProduction(input),
  ];
}

export const FEATURE_STEP_IDS: StepId[] = [
  "owner-input",
  "analyst",
  "mockup",
  "plan",
  "code",
  "github",
  "test",
  "production",
];

export const FEATURE_STEP_LABELS = featureI18n.steps;
