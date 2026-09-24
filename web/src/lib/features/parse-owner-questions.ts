import yaml from "js-yaml";
import { z } from "zod";
import { dateOnly } from "./parse-spec";
import type { OwnerQuestion, ParseResult } from "./types";

const dateSchema = z.preprocess((value) => dateOnly(value) ?? value, z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
const questionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["open", "answered"]),
  opened: dateSchema,
  feature: z.string().min(1).nullable(),
  question: z.string().min(1),
  why: z.string().min(1),
  ifYes: z.string().min(1),
  ifNo: z.string().min(1),
  source: z.string().min(1),
});
const questionsSchema = z.object({ version: z.literal(1), questions: z.array(questionSchema) });

export function parseOwnerQuestions(content: string, filePath: string): ParseResult<OwnerQuestion[]> {
  void filePath;
  try {
    const parsed = questionsSchema.safeParse(yaml.load(content));
    if (!parsed.success) return { data: null, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
    return { data: parsed.data.questions, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "YAML parse error" };
  }
}
