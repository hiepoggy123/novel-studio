import { jsonSchema } from "ai";
import { z } from "zod";

export const ProposedPointSchema = z.object({
  title: z.string(),
  description: z.string(),
  chapterOrder: z.number().int().optional(),
  expectedPayoff: z.string().optional(),
  coreHook: z.boolean().optional(),
});

export const PlotProposalItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("new-arc"),
    title: z.string(),
    description: z.string(),
    type: z.enum(["main", "subplot", "character"]),
    plotPoints: z.array(ProposedPointSchema).max(12),
  }),
  z.object({
    kind: z.literal("add-points"),
    targetArcId: z.string(),
    plotPoints: z.array(ProposedPointSchema).min(1).max(12),
  }),
]);

export const PlotProposalSchema = z.object({
  items: z.array(PlotProposalItemSchema).min(1).max(8),
  reasoning: z.string(),
});

export type ProposedPoint = z.infer<typeof ProposedPointSchema>;
export type PlotProposalItem = z.infer<typeof PlotProposalItemSchema>;
export type PlotProposal = z.infer<typeof PlotProposalSchema>;

/**
 * Loose JSON-schema mirror for the generateStructured fallback path (used when
 * the model returns text instead of calling the submit tool). The result is
 * re-validated with PlotProposalSchema.parse afterward, so this can be permissive.
 */
export const plotProposalOutputSchema = jsonSchema<PlotProposal>({
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["new-arc", "add-points"] },
          title: { type: "string" },
          description: { type: "string" },
          type: { type: "string", enum: ["main", "subplot", "character"] },
          targetArcId: { type: "string" },
          plotPoints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                chapterOrder: { type: "number" },
                expectedPayoff: { type: "string" },
                coreHook: { type: "boolean" },
              },
              required: ["title", "description"],
            },
          },
        },
        required: ["kind", "plotPoints"],
      },
    },
    reasoning: { type: "string" },
  },
  required: ["items", "reasoning"],
});
