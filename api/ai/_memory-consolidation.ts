import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

/**
 * Shared long-term-memory consolidation, used by both `extract-memories.ts`
 * and `process-daily-notes.ts`. Both endpoints previously kept byte-identical
 * copies of the schema, prompt, and `generateText` consolidation call.
 */

export const memoryConsolidationSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(180)
    .describe("Deduplicated summary combining all info"),
  content: z
    .string()
    .min(1)
    .max(2000)
    .describe("Deduplicated content – no repeated info, newer wins conflicts"),
});

const CONSOLIDATION_PROMPT = `Merge NEW and EXISTING memory info into one clean entry.

Rules:
- Remove all duplicate or redundant information
- If new info contradicts old info, keep the newer version
- Keep it concise – no repetition, no filler
- Organize logically
- Summary must be under 180 chars`;

export interface MemoryToConsolidate {
  summary: string;
  content: string;
}

export interface ExistingMemoryContent {
  key: string;
  summary: string;
  content: string;
}

/**
 * Merge a new memory with overlapping existing memories into one deduplicated
 * entry via the consolidation model. Returns the merged summary + content.
 */
export async function consolidateMemoryContent(
  newMemory: MemoryToConsolidate,
  existingContents: ExistingMemoryContent[]
): Promise<{ summary: string; content: string }> {
  const existingContentText = existingContents
    .map(
      (memory) =>
        `Key: ${memory.key}\nSummary: ${memory.summary}\nContent: ${memory.content}`
    )
    .join("\n\n");

  const { output: consolidated } = await generateText({
    model: google("gemini-3-flash-preview"),
    output: Output.object({
      schema: memoryConsolidationSchema,
    }),
    prompt: `${CONSOLIDATION_PROMPT}\n\nNEW:\nSummary: ${newMemory.summary}\nContent: ${newMemory.content}\n\nEXISTING:\n${existingContentText}\n\nMerge into one clean, deduplicated entry.`,
    temperature: 0.3,
  });

  return { summary: consolidated.summary, content: consolidated.content };
}
