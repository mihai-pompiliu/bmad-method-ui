import yaml from "js-yaml";
import { z } from "zod";
import { dateOnly } from "./parse-spec";
import type { ParseResult, Release } from "./types";

const dateSchema = z.preprocess((value) => dateOnly(value) ?? value, z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
const releaseSchema = z.object({
  feature: z.string().min(1),
  component: z.string().min(1),
  version: z.string().min(1),
  environment: z.enum(["test", "prod"]),
  server: z.string().min(1),
  date: dateSchema,
  verified: z.boolean(),
  note: z.string().optional(),
});
const releasesSchema = z.object({ version: z.literal(1), releases: z.array(releaseSchema) });

export function parseReleases(content: string, filePath: string): ParseResult<Release[]> {
  try {
    const parsed = releasesSchema.safeParse(yaml.load(content));
    if (!parsed.success) return { data: null, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
    return { data: parsed.data.releases.map((release) => ({ ...release, sourcePath: filePath })), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "YAML parse error" };
  }
}
