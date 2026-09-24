import matter from "gray-matter";
import { dateOnly, resolveFeaturePath, toFeaturePath } from "./parse-spec";
import type { FeatureEpic } from "./types";

function dateFromFilename(path: string): string | null {
  return path.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Return the epic in a feature-only epics file, or null when it is not tied to this SPEC. */
export function parseFeatureEpics(
  content: string,
  filePath: string,
  specPath: string,
): FeatureEpic | null {
  const normalizedFilePath = toFeaturePath(filePath);
  const normalizedSpecPath = toFeaturePath(specPath);
  try {
    const { data, content: body } = matter(content);
    const knownPaths = new Set([normalizedSpecPath]);
    const referencesSpec = asStringArray(data.inputDocuments).some((inputDocument) => {
      const resolved = resolveFeaturePath(inputDocument, normalizedFilePath, knownPaths);
      return resolved.path === normalizedSpecPath;
    });
    if (!referencesSpec) return null;

    const epicMatch = body.match(/^##\s+Epic\s+(\d+)\s*:\s*(.+)$/im);
    if (!epicMatch) return null;
    const stories = Array.from(body.matchAll(/^###\s+Story\s+(\d+\.\d+)\s*:\s*(.+)$/gim)).map((match) => ({
      id: match[1],
      title: match[2].trim(),
    }));

    return {
      id: epicMatch[1],
      title: epicMatch[2].trim(),
      path: normalizedFilePath,
      date: dateOnly(data.date) ?? dateOnly(data.created) ?? dateFromFilename(normalizedFilePath),
      stories,
    };
  } catch {
    return null;
  }
}
