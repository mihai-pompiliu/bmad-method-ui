import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ContentProvider } from "@/lib/content-provider";
import { computeFeatureNow } from "../compute-now";
import { computeFeatureSteps } from "../compute-steps";
import { getFeatureBoard } from "../index";
import { parseBoardConfig } from "../parse-board-config";
import { parseFeatureEpics } from "../parse-feature-epics";
import { parseOwnerQuestions } from "../parse-owner-questions";
import { parseReleases } from "../parse-releases";
import { parseSpec, resolveFeaturePath } from "../parse-spec";
import type {
  FeatureComputationInput,
  FeatureStep,
  GithubActivity,
  StepId,
} from "../types";

const fixtureRoot = path.resolve(__dirname, "fixtures/broc");

function step(
  steps: FeatureStep[],
  id: StepId,
): FeatureStep {
  const value = steps.find((item) => item.id === id);
  if (!value) throw new Error(`Missing step ${id}`);
  return value;
}

function github(
  overrides: Partial<GithubActivity> = {},
): GithubActivity {
  return {
    access: "available",
    matchingBranches: [],
    pullRequests: [],
    ...overrides,
  };
}

function input(
  overrides: Partial<FeatureComputationInput> = {},
): FeatureComputationInput {
  return {
    spec: {
      slug: "alpha",
      id: "SPEC-alpha",
      path: "_bmad-output/specs/spec-alpha/SPEC.md",
      title: "Альфа",
      summary: "Первое предложение требований.",
      sources: [],
      companions: [],
      capabilities: [],
      created: "2026-09-20",
    },
    config: {
      version: 1,
      order: [],
      exclude: [],
      defaults: { repos: ["owner/component"] },
      environments: {
        test: { name: "Тест" },
        prod: { name: "Прод", servers: [] },
      },
      features: {},
    },
    ownerInput: [],
    analystAudit: null,
    mockup: { exists: false, status: null, sourcePath: null, unreadable: false },
    epic: null,
    sprintStatusAvailable: true,
    sprintStories: [],
    github: github(),
    releases: [],
    questions: [],
    ...overrides,
  };
}

describe("feature data parsers", () => {
  it("parses a SPEC title, Why sentence, capabilities and frontmatter", () => {
    const parsed = parseSpec(`---
id: SPEC-alpha
created: 2026-09-20
sources: [../mockups/alpha.html]
companions: [contract.md]
---
# Альфа

## Why

Первое предложение. Второе предложение.

## Capabilities
- **CAP-1 — One**
- **CAP-2 — Two**
`, "_bmad-output/specs/spec-alpha/SPEC.md");

    expect(parsed.slug).toBe("alpha");
    expect(parsed.id).toBe("SPEC-alpha");
    expect(parsed.title).toBe("Альфа");
    expect(parsed.summary).toBe("Первое предложение.");
    expect(parsed.capabilities).toEqual(["CAP-1", "CAP-2"]);
    expect(parsed.created).toBe("2026-09-20");
  });

  it("resolves relative, output-root and external source paths without escaping the project", () => {
    const knownPaths = new Set([
      "_bmad-output/specs/spec-alpha/SPEC.md",
      "_bmad-output/planning-artifacts/mockups/alpha.html",
    ]);

    expect(resolveFeaturePath(
      "../../planning-artifacts/mockups/alpha.html",
      "_bmad-output/specs/spec-alpha/SPEC.md",
      knownPaths,
    )).toMatchObject({ path: "_bmad-output/planning-artifacts/mockups/alpha.html", external: false });
    expect(resolveFeaturePath(
      "_bmad-output/planning-artifacts/mockups/alpha.html",
      "_bmad-output/specs/spec-alpha/SPEC.md",
      knownPaths,
    )).toMatchObject({ path: "_bmad-output/planning-artifacts/mockups/alpha.html", external: false });
    expect(resolveFeaturePath(
      "D:/Projects/Monitoring/DESIGN.md",
      "_bmad-output/specs/spec-alpha/SPEC.md",
      knownPaths,
    )).toMatchObject({ path: null, external: true });
  });

  it("parses feature epics only when inputDocuments points to the SPEC", () => {
    const parsed = parseFeatureEpics(`---
inputDocuments:
  - ../specs/spec-alpha/SPEC.md
---
## Epic 7: Alpha plan
### Story 7.1: First
### Story 7.2: Second
`, "_bmad-output/planning-artifacts/epics-alpha-2026-09-23.md", "_bmad-output/specs/spec-alpha/SPEC.md");

    expect(parsed).toMatchObject({ id: "7", title: "Alpha plan" });
    expect(parsed?.stories.map((story) => story.id)).toEqual(["7.1", "7.2"]);
  });

  it("validates optional YAML files and returns parse errors without throwing", () => {
    expect(parseBoardConfig("version: [", "_bmad-output/feature-board.yaml").error).toBeTruthy();
    expect(parseReleases("version: 1\nreleases: bad", "_bmad-output/releases.yaml").error).toBeTruthy();
    expect(parseOwnerQuestions("version: 1\nquestions: bad", "_bmad-output/owner-questions.yaml").error).toBeTruthy();

    const board = parseBoardConfig(`version: 1
features:
  alpha:
    title: Alpha
`, "_bmad-output/feature-board.yaml");
    expect(board.data?.features.alpha?.title).toBe("Alpha");
  });
});

describe("eight feature steps", () => {
  it("computes owner input and analyst review from declared sources", () => {
    const steps = computeFeatureSteps(input({
      ownerInput: [{ rawPath: "_bmad-output/planning-artifacts/ux-designs/a/mockups/a.html", path: "_bmad-output/planning-artifacts/ux-designs/a/mockups/a.html", kind: "mockup", date: "2026-09-15", external: false, exists: true }],
      analystAudit: { path: "_bmad-output/planning-artifacts/requirements-audits/a.md", date: "2026-09-16" },
    }));
    expect(step(steps, "owner-input")).toMatchObject({ state: "done", label: "Макет доски", date: "2026-09-15" });
    expect(step(steps, "analyst")).toMatchObject({ state: "done", label: "Сверка от 16.09" });
  });

  it("does not manufacture owner-input or analyst steps when their sources are absent", () => {
    const steps = computeFeatureSteps(input());
    expect(step(steps, "owner-input")).toMatchObject({ state: "none" });
    expect(step(steps, "analyst")).toMatchObject({ state: "none" });
  });

  it("keeps external owner input as declared but not openable", () => {
    const steps = computeFeatureSteps(input({
      ownerInput: [{ path: null, kind: "ux", date: "2026-09-15", external: true, exists: true, rawPath: "D:/external/DESIGN.md" }],
    }));
    expect(step(steps, "owner-input")).toMatchObject({ state: "done", sourcePaths: ["D:/external/DESIGN.md"] });
  });

  it("computes final, draft conflict, unavailable and missing mockup states", () => {
    expect(step(computeFeatureSteps(input({
      mockup: { exists: true, status: "final", sourcePath: "DESIGN.md", unreadable: false },
    })), "mockup")).toMatchObject({ state: "done", label: "Утверждён" });

    expect(step(computeFeatureSteps(input({
      config: { ...input().config, features: { alpha: { mockupApproval: { date: "2026-09-14", source: "owner decision" } } } },
      mockup: { exists: true, status: "draft", sourcePath: "DESIGN.md", unreadable: false },
    })), "mockup")).toMatchObject({ state: "check" });

    expect(step(computeFeatureSteps(input({
      mockup: { exists: true, status: null, sourcePath: "D:/external/DESIGN.md", unreadable: true },
    })), "mockup")).toMatchObject({ state: "unknown" });

    expect(step(computeFeatureSteps(input()), "mockup")).toMatchObject({ state: "none" });
  });

  it("computes plan done and partial", () => {
    const complete = input({ epic: { id: "7", title: "Plan", path: "epics-a.md", date: "2026-09-23", stories: [{ id: "7.1", title: "One" }] } });
    expect(step(computeFeatureSteps(complete), "plan")).toMatchObject({ state: "done", label: "1 история" });
    expect(step(computeFeatureSteps(input()), "plan")).toMatchObject({ state: "partial", label: "SPEC есть, историй нет" });
  });

  it("computes code states from sprint stories", () => {
    const epic = { id: "7", title: "Plan", path: "epics-a.md", date: "2026-09-23", stories: [{ id: "7.1", title: "One" }, { id: "7.2", title: "Two" }] };
    expect(step(computeFeatureSteps(input({ epic, sprintStories: [{ id: "7.1", status: "in-progress" }] })), "code")).toMatchObject({ state: "partial", label: "В работе: 7.1" });
    expect(step(computeFeatureSteps(input({ epic, sprintStories: [{ id: "7.1", status: "review" }] })), "code")).toMatchObject({ state: "partial", label: "На проверке: 7.1" });
    expect(step(computeFeatureSteps(input({ epic, sprintStories: [{ id: "7.1", status: "done" }, { id: "7.2", status: "done" }] })), "code")).toMatchObject({ state: "done", label: "Все 2 истории готовы" });
    expect(step(computeFeatureSteps(input({ epic, sprintStories: [{ id: "7.1", status: "backlog" }] })), "code")).toMatchObject({ state: "none", label: "Не начат" });
    expect(step(computeFeatureSteps(input({ epic })), "code").reason).toContain("не в плане спринта");
  });

  it("computes GitHub partial, done, previous, none and unavailable states", () => {
    expect(step(computeFeatureSteps(input({ github: github({ matchingBranches: ["feature/alpha"] }) })), "github")).toMatchObject({ state: "partial", label: "Ветка feature/alpha" });
    expect(step(computeFeatureSteps(input({ github: github({ pullRequests: [{ number: 12, title: "alpha", state: "closed", merged: true, base: "main" }] }) })), "github")).toMatchObject({ state: "done", label: "В main" });
    expect(step(computeFeatureSteps(input({ releases: [{ feature: "alpha", component: "api", version: "1.0.0", environment: "test", server: "test", date: "2026-09-21", verified: true }] })), "github")).toMatchObject({ state: "previous", label: "Прежняя версия 1.0.0" });
    expect(step(computeFeatureSteps(input()), "github")).toMatchObject({ state: "none" });
    expect(step(computeFeatureSteps(input({ github: github({ access: "unavailable" }) })), "github")).toMatchObject({ state: "unknown", label: "Нет доступа к GitHub" });
  });

  it("computes test release states, including a release on the SPEC date", () => {
    const current = { feature: "alpha", component: "api", version: "2.0.0", environment: "test" as const, server: "test", date: "2026-09-20", verified: true };
    expect(step(computeFeatureSteps(input({ releases: [current] })), "test")).toMatchObject({ state: "done", label: "2.0.0 · проверено" });
    expect(step(computeFeatureSteps(input({ releases: [{ ...current, verified: false }] })), "test")).toMatchObject({ state: "check", label: "2.0.0 · не проверено" });
    expect(step(computeFeatureSteps(input({ releases: [{ ...current, date: "2026-09-19" }] })), "test")).toMatchObject({ state: "previous", label: "Прежняя версия 2.0.0" });
    expect(step(computeFeatureSteps(input()), "test")).toMatchObject({ state: "none", label: "Не выпускалась" });
  });

  it("computes production server states without inferring deployment", () => {
    expect(step(computeFeatureSteps(input()), "production")).toMatchObject({ state: "not-started", label: "Серверы не заданы" });
    const withServers = { ...input().config, environments: { test: { name: "Test" }, prod: { name: "Prod", servers: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }] } } };
    const release = { feature: "alpha", component: "api", version: "2.0.0", environment: "prod" as const, server: "p1", date: "2026-09-21", verified: true };
    expect(step(computeFeatureSteps(input({ config: withServers, releases: [release] })), "production")).toMatchObject({ state: "partial", label: "1 из 2 серверов" });
    expect(step(computeFeatureSteps(input({ config: withServers, releases: [release, { ...release, server: "p2" }] })), "production")).toMatchObject({ state: "done", label: "Все серверы (2)" });
    expect(step(computeFeatureSteps(input({ config: withServers, releases: [{ ...release, date: "2026-09-19" }] })), "production")).toMatchObject({ state: "previous" });
    expect(step(computeFeatureSteps(input({ config: withServers })), "production")).toMatchObject({ state: "none", label: "Не выпускалась" });
  });
});

describe("current feature status", () => {
  const steps = (changes: Partial<FeatureComputationInput> = {}) => {
    const value = input(changes);
    return { value, steps: computeFeatureSteps(value) };
  };

  it("uses the documented precedence for every Now rule", () => {
    let state = steps({ epic: { id: "7", title: "Plan", path: "e", date: "2026-09-23", stories: [{ id: "7.1", title: "One" }] }, sprintStories: [{ id: "7.1", status: "blocked", blockedReason: "Waiting for API" }] });
    expect(computeFeatureNow(state.value, state.steps)).toMatchObject({ status: "Остановлено", next: "Снять блокер" });

    state = steps({ config: { ...input().config, features: { alpha: { mockupApproval: { date: "2026-09-14", source: "owner" } } } }, mockup: { exists: true, status: "draft", sourcePath: "DESIGN.md", unreadable: false } });
    expect(computeFeatureNow(state.value, state.steps)).toMatchObject({ status: "Нужна проверка" });

    state = steps();
    expect(computeFeatureNow(state.value, state.steps)).toMatchObject({ status: "Ждёт планирования" });

    state = steps({ epic: { id: "7", title: "Plan", path: "e", date: "2026-09-23", stories: [{ id: "7.1", title: "One" }] } });
    expect(computeFeatureNow(state.value, state.steps)).toMatchObject({ status: "Ждёт старта", next: "Включить в план и начать 7.1" });

    state = steps({ epic: { id: "7", title: "Plan", path: "e", date: "2026-09-23", stories: [{ id: "7.1", title: "One" }] }, sprintStories: [{ id: "7.1", status: "in-progress" }] });
    expect(computeFeatureNow(state.value, state.steps)).toMatchObject({ status: "В работе", next: "Дождаться завершения 7.1" });

    state = steps({ epic: { id: "7", title: "Plan", path: "e", date: "2026-09-23", stories: [{ id: "7.1", title: "One" }] }, sprintStories: [{ id: "7.1", status: "review" }] });
    expect(computeFeatureNow(state.value, state.steps)).toMatchObject({ status: "На проверке", next: "Ревью кода 7.1" });

    state = steps({ epic: { id: "7", title: "Plan", path: "e", date: "2026-09-23", stories: [{ id: "7.1", title: "One" }] }, sprintStories: [{ id: "7.1", status: "done" }] });
    expect(computeFeatureNow(state.value, state.steps)).toMatchObject({ status: "Готово к тесту", next: "Выпустить на тест" });

    state = steps({ epic: { id: "7", title: "Plan", path: "e", date: "2026-09-23", stories: [{ id: "7.1", title: "One" }] }, sprintStories: [{ id: "7.1", status: "done" }], releases: [{ feature: "alpha", component: "api", version: "2", environment: "test", server: "test", date: "2026-09-21", verified: true }] });
    expect(computeFeatureNow(state.value, state.steps)).toMatchObject({ status: "На тесте", next: "Принять и выпустить в прод" });

    const config = { ...input().config, environments: { test: { name: "Test" }, prod: { name: "Prod", servers: [{ id: "p1", name: "One" }] } } };
    state = steps({ config, epic: { id: "7", title: "Plan", path: "e", date: "2026-09-23", stories: [{ id: "7.1", title: "One" }] }, sprintStories: [{ id: "7.1", status: "done" }], releases: [{ feature: "alpha", component: "api", version: "2", environment: "test", server: "test", date: "2026-09-21", verified: true }, { feature: "alpha", component: "api", version: "2", environment: "prod", server: "p1", date: "2026-09-21", verified: true }] });
    expect(computeFeatureNow(state.value, state.steps)).toMatchObject({ status: "В проде", next: null });

    state = steps({ spec: { ...input().spec, created: null }, epic: { id: "7", title: "Plan", path: "e", date: "2026-09-23", stories: [{ id: "7.1", title: "One" }] }, sprintStatusAvailable: false, github: github({ access: "unavailable" }) });
    expect(computeFeatureNow(state.value, state.steps)).toMatchObject({ status: "Неизвестно" });
  });

  it("treats an open feature-specific owner question as a blocker, not a global one", () => {
    const global = steps({ questions: [{ id: "q-global", status: "open", feature: null, question: "Global", why: "Why", ifYes: "Yes", ifNo: "No", source: "x", opened: "2026-09-24" }] });
    expect(computeFeatureNow(global.value, global.steps).status).toBe("Ждёт планирования");

    const specific = steps({ questions: [{ id: "q-alpha", status: "open", feature: "alpha", question: "Question", why: "Why", ifYes: "Yes", ifNo: "No", source: "x", opened: "2026-09-24" }] });
    expect(computeFeatureNow(specific.value, specific.steps)).toMatchObject({ status: "Остановлено", next: "Ответить на вопрос" });
  });
});

class FixtureProvider implements ContentProvider {
  constructor(private readonly omittedPaths = new Set<string>()) {}

  async getTree() {
    const paths: string[] = [];
    const walk = async (directory: string) => {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(absolute);
        if (entry.isFile()) {
          const relative = path.relative(fixtureRoot, absolute).replaceAll("\\", "/");
          if (!this.omittedPaths.has(relative)) paths.push(relative);
        }
      }
    };
    await walk(path.join(fixtureRoot, "_bmad-output"));
    return { paths, rootDirectories: ["_bmad-output"] };
  }

  async getFileContent(filePath: string) {
    return fs.readFile(path.join(fixtureRoot, filePath), "utf8");
  }

  async getFileModifiedAt(filePath: string) {
    if (filePath.includes("spec-quote-monitoring")) return "2026-09-23";
    if (filePath.includes("spec-execution-monitoring")) return "2026-09-23";
    if (filePath.includes("spec-quote-settings")) return "2026-09-23";
    return null;
  }

  async validateRoot() {}
}

describe("BROC fixture", () => {
  it("produces the accepted three-feature board without GitHub access", async () => {
    const board = await getFeatureBoard({
      owner: "local",
      name: "broc",
      branch: "local",
      displayName: "BROC",
      description: null,
      sourceType: "local",
      localPath: fixtureRoot,
      lastSyncedAt: null,
    }, new FixtureProvider(), async () => github({ access: "unavailable" }));

    expect(board.features.map((feature) => feature.slug)).toEqual([
      "quote-monitoring",
      "execution-monitoring-v1",
      "quote-settings",
    ]);

    const quoteMonitoring = board.features[0];
    expect(quoteMonitoring.steps.slice(0, 4).map((item) => item.state)).toEqual(["done", "done", "done", "done"]);
    expect(step(quoteMonitoring.steps, "plan").label).toBe("5 историй");
    expect(step(quoteMonitoring.steps, "code")).toMatchObject({ state: "none", label: "Не начат" });
    expect(step(quoteMonitoring.steps, "github")).toMatchObject({ state: "unknown", label: "Нет доступа к GitHub" });
    expect(step(quoteMonitoring.steps, "test")).toMatchObject({ state: "previous", label: "Прежняя версия 0.7.1", date: "2026-09-14" });
    expect(step(quoteMonitoring.steps, "production")).toMatchObject({ state: "not-started" });
    expect(quoteMonitoring.now).toMatchObject({ status: "Ждёт старта", next: "Включить в план и начать 7.1" });

    const execution = board.features[1];
    expect(execution.steps.slice(0, 3).map((item) => item.state)).toEqual(["done", "done", "done"]);
    expect(step(execution.steps, "plan")).toMatchObject({ state: "partial", label: "SPEC есть, историй нет" });
    expect(step(execution.steps, "test").label).toContain("не по макету");
    expect(execution.now.status).toBe("Ждёт планирования");

    const quoteSettings = board.features[2];
    expect(["check", "unknown"]).toContain(step(quoteSettings.steps, "mockup").state);
    expect(step(quoteSettings.steps, "plan").state).toBe("partial");
    expect(step(quoteSettings.steps, "test")).toMatchObject({ state: "previous", label: "Прежняя версия 0.6.0", date: "2026-09-09" });
    expect(quoteSettings.now.status).toBe("Нужна проверка");
  });

  it("works without releases.yaml and leaves release steps factual", async () => {
    const provider = new FixtureProvider(new Set(["_bmad-output/releases.yaml"]));
    const board = await getFeatureBoard({ owner: "local", name: "broc", branch: "local", displayName: "BROC", description: null, sourceType: "local", localPath: fixtureRoot, lastSyncedAt: null }, provider, async () => github());
    expect(board.features).toHaveLength(3);
    for (const feature of board.features) {
      expect(step(feature.steps, "test")).toMatchObject({ state: "none", label: "Не выпускалась" });
      expect(step(feature.steps, "production")).toMatchObject({ state: "not-started", label: "Серверы не заданы" });
    }
  });
});
