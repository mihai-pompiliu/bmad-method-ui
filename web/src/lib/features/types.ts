import type { StoryStatus } from "@/lib/bmad/types";

export type StepState =
  | "done"
  | "partial"
  | "check"
  | "previous"
  | "none"
  | "not-started"
  | "unknown";

export type StepId =
  | "owner-input"
  | "analyst"
  | "mockup"
  | "plan"
  | "code"
  | "github"
  | "test"
  | "production";

export interface FeatureStep {
  id: StepId;
  state: StepState;
  label: string;
  date: string | null;
  sourcePaths: string[];
  reason: string;
}

export interface FeatureNow {
  status: string;
  reason: string;
  next: string | null;
}

export interface ResolvedFeaturePath {
  rawPath: string;
  path: string | null;
  external: boolean;
  exists: boolean;
}

export type FeatureSourceKind = "mockup" | "ux" | "prd" | "audit" | "research" | "other";

export interface FeatureSource extends ResolvedFeaturePath {
  kind: FeatureSourceKind;
  date: string | null;
}

export interface FeatureSpec {
  slug: string;
  id: string;
  path: string;
  title: string;
  summary: string;
  sources: string[];
  companions: string[];
  capabilities: string[];
  created: string | null;
}

export interface FeatureStory {
  id: string;
  title: string;
}

export interface FeatureEpic {
  id: string;
  title: string;
  path: string;
  date: string | null;
  stories: FeatureStory[];
}

export interface FeatureBoardFeatureConfig {
  title?: string;
  summary?: string;
  analystVerdict?: string;
  ownerInput?: { label?: string };
  mockupApproval?: {
    date: string;
    source: string;
  };
  previousNote?: string;
  repos?: string[];
}

export interface FeatureServer {
  id: string;
  name: string;
}

export interface FeatureBoardConfig {
  version: 1;
  order: string[];
  exclude: string[];
  defaults: { repos: string[] };
  environments: {
    test: { name: string };
    prod: { name: string; servers: FeatureServer[] };
  };
  features: Record<string, FeatureBoardFeatureConfig>;
}

export interface Release {
  feature: string;
  component: string;
  version: string;
  environment: "test" | "prod";
  server: string;
  date: string;
  verified: boolean;
  note?: string;
  sourcePath?: string;
}

export interface OwnerQuestion {
  id: string;
  status: "open" | "answered";
  opened: string;
  feature: string | null;
  question: string;
  why: string;
  ifYes: string;
  ifNo: string;
  source: string;
}

export interface AnalystAudit {
  path: string;
  date: string | null;
  unreadable?: boolean;
}

export interface MockupEvidence {
  exists: boolean;
  status: "final" | "draft" | null;
  sourcePath: string | null;
  unreadable: boolean;
}

export interface SprintFeatureStory {
  id: string;
  status: StoryStatus;
  blockedReason?: string;
}

export interface GithubPullRequest {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  base: string;
}

export interface GithubActivity {
  access: "available" | "unavailable";
  matchingBranches: string[];
  pullRequests: GithubPullRequest[];
  error?: string;
}

export interface FeatureComputationInput {
  spec: FeatureSpec;
  config: FeatureBoardConfig;
  ownerInput: FeatureSource[];
  analystAudit: AnalystAudit | null;
  mockup: MockupEvidence;
  epic: FeatureEpic | null;
  sprintStatusAvailable: boolean;
  sprintStories: SprintFeatureStory[];
  github: GithubActivity;
  releases: Release[];
  questions: OwnerQuestion[];
}

export interface Feature {
  slug: string;
  title: string;
  summary: string;
  config: FeatureBoardFeatureConfig;
  spec: FeatureSpec;
  ownerInput: FeatureSource[];
  analystAudit: AnalystAudit | null;
  mockup: MockupEvidence;
  epic: FeatureEpic | null;
  releases: Release[];
  productionServers: FeatureServer[];
  questions: OwnerQuestion[];
  steps: FeatureStep[];
  now: FeatureNow;
}

export interface FeatureParseError {
  file: string;
  error: string;
  contentType: "feature-board" | "releases" | "owner-questions" | "spec" | "epic" | "sprint-status" | "source";
}

export interface FeatureBoard {
  features: Feature[];
  openQuestions: OwnerQuestion[];
  readAt: string;
  parseHealth: {
    errors: FeatureParseError[];
    totalFiles: number;
    successfulFiles: number;
  };
}

export interface ParseResult<T> {
  data: T | null;
  error: string | null;
}
