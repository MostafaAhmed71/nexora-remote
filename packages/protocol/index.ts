import { z } from "zod";
export const qualitySchema = z.object({
  width: z.number().int().min(320).max(2560),
  quality: z.number().int().min(15).max(85),
  fps: z.number().int().min(1).max(15),
  monitor: z.number().int().min(0).max(31),
});
export const inputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("wheel"),
    delta: z.number().int().min(-1200).max(1200),
    seq: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("text"),
    text: z.string().min(1).max(1024),
    seq: z.number().int().positive(),
  }),
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
export const PROTOCOL_VERSION = 2;
export function acceptSequence(previous: number, next: number) {
  return Number.isSafeInteger(next) && next > previous;
}
