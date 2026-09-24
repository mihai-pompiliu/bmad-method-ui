import matter from "gray-matter";
import type { ContentProvider } from "@/lib/content-provider";
import type { RepoConfig } from "@/lib/types";
import { parseSprintStatus } from "@/lib/bmad/parse-sprint-status";
import { computeFeatureNow } from "./compute-now";
import { computeFeatureSteps } from "./compute-steps";
import { featureI18n } from "./i18n.ru";
import { emptyBoardConfig, parseBoardConfig } from "./parse-board-config";
import { parseFeatureEpics } from "./parse-feature-epics";
import { parseOwnerQuestions } from "./parse-owner-questions";
import { parseReleases } from "./parse-releases";
import { dateOnly, parseSpec, resolveFeaturePath, toFeaturePath } from "./parse-spec";
import type {
  AnalystAudit,
  Feature,
  FeatureBoard,
  FeatureBoardConfig,
  FeatureParseError,
  FeatureSource,
  GithubActivity,
  MockupEvidence,
  OwnerQuestion,
  Release,
  SprintFeatureStory,
} from "./types";

export type GithubActivityLookup = (input: {
  repos: string[];
  slug: string;
  storyIds: string[];
}) => Promise<GithubActivity>;

interface PathIndex {
  known: Set<string>;
  rawByNormalized: Map<string, string>;
}

function makePathIndex(paths: string[]): PathIndex {
  const rawByNormalized = new Map<string, string>();
  for (const rawPath of paths) {
    const normalized = toFeaturePath(rawPath);
    rawByNormalized.set(normalized, rawPath);
  }
  return { known: new Set(rawByNormalized.keys()), rawByNormalized };
}

function sourceKind(path: string): FeatureSource["kind"] {
  const normalized = toFeaturePath(path).toLowerCase();
  if (normalized.includes("requirements-audits/")) return "audit";
  if (normalized.includes("/research/") || normalized.startsWith("research/")) return "research";
  if (normalized.includes("/mockups/") || normalized.includes("mockup")) return "mockup";
  if (normalized.includes("ux-designs/")) return "ux";
  if (normalized.includes("/prds/") || normalized.startsWith("prds/")) return "prd";
  return "other";
}

function dateFromPath(path: string): string | null {
  return path.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function configFor(config: FeatureBoardConfig, slug: string) {
  return config.features[slug] ?? {};
}

function defaultGithubActivity(): GithubActivity {
  return { access: "unavailable", matchingBranches: [], pullRequests: [], error: featureI18n.computed.github.unavailable };
}

function defaultMockup(): MockupEvidence {
  return { exists: false, status: null, sourcePath: null, unreadable: false };
}

function isFeatureSpecPath(path: string): boolean {
  return /(?:^|\/)specs\/spec-[^/]+\/SPEC\.md$/i.test(path);
}

async function contentAt(provider: ContentProvider, index: PathIndex, normalizedPath: string): Promise<string> {
  const raw = index.rawByNormalized.get(normalizedPath);
  if (!raw) throw new Error("File not found in project tree");
  return provider.getFileContent(raw);
}

async function modifiedAt(provider: ContentProvider, index: PathIndex, normalizedPath: string): Promise<string | null> {
  const raw = index.rawByNormalized.get(normalizedPath);
  if (!raw || !provider.getFileModifiedAt) return null;
  return provider.getFileModifiedAt(raw);
}

function makeParseError(file: string, error: unknown, contentType: FeatureParseError["contentType"]): FeatureParseError {
  return {
    file,
    error: error instanceof Error ? error.message : String(error),
    contentType,
  };
}

function statusFromDocument(content: string): "final" | "draft" | null {
  try {
    const { data } = matter(content);
    const status = typeof data.status === "string" ? data.status.toLowerCase().trim() : "";
    return status === "final" || status === "draft" ? status : null;
  } catch {
    return null;
  }
}

function nearbyStatusPaths(source: FeatureSource): string[] {
  if (!source.path) return [];
  const path = source.path;
  const lower = path.toLowerCase();
  if (lower.endsWith("/design.md") || lower.endsWith("/experience.md")) return [path];
  const mockupsIndex = lower.lastIndexOf("/mockups/");
  if (mockupsIndex >= 0) {
    const root = path.slice(0, mockupsIndex);
    return [`${root}/DESIGN.md`, `${root}/EXPERIENCE.md`];
  }
  const uxIndex = lower.indexOf("ux-designs/");
  if (uxIndex >= 0) {
    const after = path.slice(uxIndex).split("/");
    if (after.length >= 2) {
      const root = path.slice(0, uxIndex) + after.slice(0, 2).join("/");
      return [`${root}/DESIGN.md`, `${root}/EXPERIENCE.md`];
    }
  }
  return [];
}

async function readMockupEvidence(
  provider: ContentProvider,
  index: PathIndex,
  sources: FeatureSource[],
  errors: FeatureParseError[],
): Promise<MockupEvidence> {
  const candidates = sources.filter((source) => source.kind === "mockup" || source.kind === "ux");
  if (candidates.length === 0) return defaultMockup();

  let unreadable = candidates.some((source) => source.external && /(?:DESIGN|EXPERIENCE)\.md$/i.test(source.rawPath));
  let sourcePath = candidates.find((source) => source.path)?.path ?? candidates[0].rawPath;
  for (const candidate of candidates) {
    for (const statusPath of nearbyStatusPaths(candidate)) {
      if (!index.known.has(statusPath)) continue;
      try {
        const status = statusFromDocument(await contentAt(provider, index, statusPath));
        if (status) return { exists: true, status, sourcePath: statusPath, unreadable: false };
        sourcePath = statusPath;
      } catch (error) {
        unreadable = true;
        errors.push(makeParseError(statusPath, error, "source"));
      }
    }
  }
  return { exists: true, status: null, sourcePath, unreadable };
}

async function readAnalystAudit(
  provider: ContentProvider,
  index: PathIndex,
  sources: FeatureSource[],
  errors: FeatureParseError[],
): Promise<AnalystAudit | null> {
  const candidate = sources.find((source) => source.kind === "audit" || source.kind === "research");
  if (!candidate) return null;
  if (!candidate.path || !candidate.exists) {
    return { path: candidate.rawPath, date: null, unreadable: true };
  }
  try {
    const content = await contentAt(provider, index, candidate.path);
    const { data } = matter(content);
    return { path: candidate.path, date: dateOnly(data.date) ?? candidate.date, unreadable: false };
  } catch (error) {
    errors.push(makeParseError(candidate.path, error, "source"));
    return { path: candidate.path, date: null, unreadable: true };
  }
}

async function resolveSources(
  provider: ContentProvider,
  index: PathIndex,
  specPath: string,
  rawSources: string[],
  projectRoot: string | null,
): Promise<FeatureSource[]> {
  return Promise.all(rawSources.map(async (rawPath) => {
    const resolved = resolveFeaturePath(rawPath, specPath, index.known, projectRoot);
    const path = resolved.path;
    const modified = path && resolved.exists ? await modifiedAt(provider, index, path) : null;
    return {
      ...resolved,
      kind: sourceKind(path ?? rawPath),
      date: dateFromPath(path ?? rawPath) ?? dateOnly(modified),
    };
  }));
}

function selectOwnerInput(sources: FeatureSource[]): FeatureSource[] {
  return sources.filter((source) => source.kind === "mockup" || source.kind === "ux" || source.kind === "prd");
}

async function findFeatureEpic(
  provider: ContentProvider,
  index: PathIndex,
  outputDir: string,
  specPath: string,
  errors: FeatureParseError[],
) {
  const candidates = [...index.known].filter((path) => (
    path.startsWith(`${outputDir}/planning-artifacts/`) &&
    /^epics[^/]*\.md$/i.test(path.split("/").pop() ?? "")
  ));
  for (const candidate of candidates) {
    try {
      const epic = parseFeatureEpics(await contentAt(provider, index, candidate), candidate, specPath);
      if (epic) return epic;
    } catch (error) {
      errors.push(makeParseError(candidate, error, "epic"));
    }
  }
  return null;
}

function sortFeatures(features: Feature[], order: string[]): Feature[] {
  const positions = new Map(order.map((slug, index) => [slug, index]));
  return [...features].sort((left, right) => {
    const leftPosition = positions.get(left.slug);
    const rightPosition = positions.get(right.slug);
    if (leftPosition !== undefined || rightPosition !== undefined) {
      if (leftPosition === undefined) return 1;
      if (rightPosition === undefined) return -1;
      return leftPosition - rightPosition;
    }
    return (right.spec.created ?? "").localeCompare(left.spec.created ?? "") || left.slug.localeCompare(right.slug);
  });
}

/**
 * Read feature-board data exclusively through a ContentProvider. It has no
 * writes, so opening a feature board cannot alter a BMAD project.
 */
export async function getFeatureBoard(
  config: RepoConfig,
  provider: ContentProvider,
  lookupGithubActivity?: GithubActivityLookup,
): Promise<FeatureBoard> {
  const initialTree = await provider.getTree();
  const index = makePathIndex(initialTree.paths);
  const outputDir = [...index.known].some((path) => path.startsWith("_bmad-output/")) ? "_bmad-output" : "_bmad-output";
  const parseErrors: FeatureParseError[] = [];
  let totalFiles = 0;
  let successfulFiles = 0;

  const configPath = `${outputDir}/feature-board.yaml`;
  let boardConfig = emptyBoardConfig();
  if (index.known.has(configPath)) {
    totalFiles++;
    try {
      const parsed = parseBoardConfig(await contentAt(provider, index, configPath), configPath);
      if (parsed.data) {
        boardConfig = parsed.data;
        successfulFiles++;
      } else {
        parseErrors.push(makeParseError(configPath, parsed.error ?? "Invalid YAML", "feature-board"));
      }
    } catch (error) {
      parseErrors.push(makeParseError(configPath, error, "feature-board"));
    }
  }

  const releasesPath = `${outputDir}/releases.yaml`;
  let releases: Release[] = [];
  if (index.known.has(releasesPath)) {
    totalFiles++;
    try {
      const parsed = parseReleases(await contentAt(provider, index, releasesPath), releasesPath);
      if (parsed.data) {
        releases = parsed.data;
        successfulFiles++;
      } else {
        parseErrors.push(makeParseError(releasesPath, parsed.error ?? "Invalid YAML", "releases"));
      }
    } catch (error) {
      parseErrors.push(makeParseError(releasesPath, error, "releases"));
    }
  }

  const questionsPath = `${outputDir}/owner-questions.yaml`;
  let questions: OwnerQuestion[] = [];
  if (index.known.has(questionsPath)) {
    totalFiles++;
    try {
      const parsed = parseOwnerQuestions(await contentAt(provider, index, questionsPath), questionsPath);
      if (parsed.data) {
        questions = parsed.data;
        successfulFiles++;
      } else {
        parseErrors.push(makeParseError(questionsPath, parsed.error ?? "Invalid YAML", "owner-questions"));
      }
    } catch (error) {
      parseErrors.push(makeParseError(questionsPath, error, "owner-questions"));
    }
  }

  let sprintStatusAvailable = false;
  let sprintStories: SprintFeatureStory[] = [];
  const sprintPath = [...index.known].find((path) => path.endsWith("/implementation-artifacts/sprint-status.yaml"));
  if (sprintPath) {
    totalFiles++;
    try {
      const parsed = parseSprintStatus(await contentAt(provider, index, sprintPath));
      if (parsed) {
        sprintStatusAvailable = true;
        sprintStories = parsed.sprintStatus.stories.map((story) => ({ id: story.id, status: story.status }));
        successfulFiles++;
      } else {
        parseErrors.push(makeParseError(sprintPath, "Failed to parse sprint status YAML", "sprint-status"));
      }
    } catch (error) {
      parseErrors.push(makeParseError(sprintPath, error, "sprint-status"));
    }
  }

  const specPaths = [...index.known].filter(isFeatureSpecPath);
  const features: Feature[] = [];
  for (const specPath of specPaths) {
    totalFiles++;
    try {
      const spec = parseSpec(
        await contentAt(provider, index, specPath),
        specPath,
        await modifiedAt(provider, index, specPath),
      );
      successfulFiles++;
      if (boardConfig.exclude.includes(spec.slug)) continue;

      const allSources = await resolveSources(provider, index, spec.path, spec.sources, config.localPath);
      const ownerInput = selectOwnerInput(allSources);
      const analystAudit = await readAnalystAudit(provider, index, allSources, parseErrors);
      const mockup = await readMockupEvidence(provider, index, allSources, parseErrors);
      const epic = await findFeatureEpic(provider, index, outputDir, spec.path, parseErrors);
      const repos = configFor(boardConfig, spec.slug).repos ?? boardConfig.defaults.repos;
      const github = lookupGithubActivity
        ? await lookupGithubActivity({ repos, slug: spec.slug, storyIds: epic?.stories.map((story) => story.id) ?? [] })
        : defaultGithubActivity();
      const input = {
        spec,
        config: boardConfig,
        ownerInput,
        analystAudit,
        mockup,
        epic,
        sprintStatusAvailable,
        sprintStories,
        github,
        releases,
        questions,
      };
      const steps = computeFeatureSteps(input);
      const now = computeFeatureNow(input, steps);
      const configured = configFor(boardConfig, spec.slug);
      features.push({
        slug: spec.slug,
        title: configured.title ?? spec.title,
        summary: configured.summary ?? spec.summary.slice(0, 90),
        config: configured,
        spec,
        ownerInput,
        analystAudit,
        mockup,
        epic,
        releases: releases.filter((release) => release.feature === spec.slug),
        productionServers: boardConfig.environments.prod.servers,
        questions: questions.filter((question) => question.feature === spec.slug),
        steps,
        now,
      });
    } catch (error) {
      parseErrors.push(makeParseError(specPath, error, "spec"));
    }
  }

  return {
    features: sortFeatures(features, boardConfig.order),
    openQuestions: questions.filter((question) => question.status === "open"),
    readAt: new Date().toISOString(),
    parseHealth: { errors: parseErrors, totalFiles, successfulFiles },
  };
}

export type {
  Feature,
  FeatureBoard,
  FeatureBoardConfig,
  FeatureNow,
  FeatureStep,
  StepId,
  StepState,
} from "./types";
