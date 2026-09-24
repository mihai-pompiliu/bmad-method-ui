import yaml from "js-yaml";
import { z } from "zod";
import { dateOnly } from "./parse-spec";
import { featureI18n } from "./i18n.ru";
import type { FeatureBoardConfig, ParseResult } from "./types";

const dateSchema = z.preprocess(
  (value) => dateOnly(value) ?? value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
);

const featureConfigSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  analystVerdict: z.string().min(1).optional(),
  ownerInput: z.object({ label: z.string().min(1).optional() }).optional(),
  mockupApproval: z.object({ date: dateSchema, source: z.string().min(1) }).optional(),
  previousNote: z.string().min(1).optional(),
  repos: z.array(z.string().min(1)).optional(),
});

const configSchema = z.object({
  version: z.literal(1),
  order: z.array(z.string().min(1)).default([]),
  exclude: z.array(z.string().min(1)).default([]),
  defaults: z.object({ repos: z.array(z.string().min(1)).default([]) }).default({ repos: [] }),
  environments: z.object({
    test: z.object({ name: z.string().min(1) }).default({ name: featureI18n.defaults.testEnvironment }),
    prod: z.object({
      name: z.string().min(1),
      servers: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).default([]),
    }).default({ name: featureI18n.defaults.productionEnvironment, servers: [] }),
  }).default({ test: { name: featureI18n.defaults.testEnvironment }, prod: { name: featureI18n.defaults.productionEnvironment, servers: [] } }),
  features: z.record(z.string(), featureConfigSchema).default({}),
});

export function emptyBoardConfig(): FeatureBoardConfig {
  return {
    version: 1,
    order: [],
    exclude: [],
    defaults: { repos: [] },
    environments: { test: { name: featureI18n.defaults.testEnvironment }, prod: { name: featureI18n.defaults.productionEnvironment, servers: [] } },
    features: {},
  };
}

export function parseBoardConfig(content: string, filePath: string): ParseResult<FeatureBoardConfig> {
  void filePath;
  try {
    const parsed = configSchema.safeParse(yaml.load(content));
    if (!parsed.success) return { data: null, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
    return { data: parsed.data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "YAML parse error" };
  }
}
