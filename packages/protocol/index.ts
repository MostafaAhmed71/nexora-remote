import { z } from "zod";
export const inputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("release"), seq: z.number().int().positive() }),
  z.object({
    kind: z.literal("move"),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    seq: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("button"),
    button: z.enum(["left", "right"]),
    down: z.boolean(),
    seq: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("key"),
    code: z.number().int().min(8).max(254),
    down: z.boolean(),
    seq: z.number().int().positive(),
  }),
]);
export type InputEvent = z.infer<typeof inputSchema>;
export const MAX_FRAME_BYTES = 2 * 1024 * 1024;
export const PROTOCOL_VERSION = 1;
export function acceptSequence(previous: number, next: number) {
  return Number.isSafeInteger(next) && next > previous;
}
