import matter from "gray-matter";
import type { FeatureSpec, ResolvedFeaturePath } from "./types";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

export function toFeaturePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/^\.\//, "");
}

export function dateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function normalizeRelative(baseDirectory: string, rawPath: string): string | null {
  const parts = baseDirectory.split("/").filter(Boolean);
  for (const segment of rawPath.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

function looksAbsolute(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
}

/**
 * Resolve a path declared in a SPEC or epic. The returned path is always
 * project-relative. Absolute paths outside the imported project intentionally
 * remain external: the UI may name them, but must not ask a ContentProvider to
 * read them.
 */
export function resolveFeaturePath(
  rawPath: string,
  currentFilePath: string,
  knownPaths: ReadonlySet<string>,
  projectRoot?: string | null,
): ResolvedFeaturePath {
  const cleanRaw = toFeaturePath(rawPath.trim());
  const currentDirectory = toFeaturePath(currentFilePath).split("/").slice(0, -1).join("/");

  if (looksAbsolute(cleanRaw)) {
    const root = projectRoot ? toFeaturePath(projectRoot).replace(/\/$/, "") : null;
    if (root && cleanRaw.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
      const candidate = cleanRaw.slice(root.length + 1);
      return {
        rawPath,
        path: candidate,
        external: false,
        exists: knownPaths.has(candidate),
      };
    }
    return { rawPath, path: null, external: true, exists: true };
  }

  const candidate = cleanRaw.startsWith("_bmad-output/") || cleanRaw.startsWith("_bmad/")
    ? cleanRaw
    : normalizeRelative(currentDirectory, cleanRaw);
  if (!candidate) return { rawPath, path: null, external: true, exists: false };

  return {
    rawPath,
    path: candidate,
    external: false,
    exists: knownPaths.has(candidate),
  };
}

function firstWhySentence(content: string): string {
  const heading = /^##\s+Why\s*$/im.exec(content);
  if (!heading || heading.index === undefined) return "";
  const afterHeading = content.slice(heading.index + heading[0].length);
  const nextHeadingIndex = afterHeading.search(/^##\s+/im);
  const section = nextHeadingIndex >= 0 ? afterHeading.slice(0, nextHeadingIndex) : afterHeading;
  const plain = section
    .replace(/^\s*>.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = plain.match(/^.+?[.!?](?:\s|$)/);
  return (sentence?.[0] ?? plain).trim();
}

export function parseSpec(content: string, filePath: string, modifiedAt?: string | null): FeatureSpec {
  const { data, content: body } = matter(content);
  const normalizedPath = toFeaturePath(filePath);
  const directoryName = normalizedPath.split("/").slice(-2, -1)[0] ?? "";
  const slug = directoryName.replace(/^spec-/, "");
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const capabilities = Array.from(body.matchAll(/\bCAP-\d+\b/g)).map((match) => match[0]);

  return {
    slug,
    id: typeof data.id === "string" ? data.id : `SPEC-${slug}`,
    path: normalizedPath,
    title: titleMatch?.[1]?.trim() || slug,
    summary: firstWhySentence(body),
    sources: asStringArray(data.sources),
    companions: asStringArray(data.companions),
    capabilities: Array.from(new Set(capabilities)),
    created: dateOnly(data.created) ?? dateOnly(modifiedAt),
  };
}
