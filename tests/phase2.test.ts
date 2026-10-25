import { allowed } from "../packages/shared/index.js";
import { it, expect } from "vitest";
import { inputSchema, qualitySchema } from "../packages/protocol/index.js";
import { recoveryDelivery } from "../apps/server/src/recovery-delivery.js";
import { virtualKey, pointInFrame } from "../apps/web/src/remote-input.js";
it("validates wheel, Unicode, quality and monitor bounds", () => {
  expect(
    inputSchema.safeParse({ kind: "text", text: "مرحبا", seq: 1 }).success,
  ).toBe(true);
  expect(
    inputSchema.safeParse({ kind: "text", text: "a".repeat(1025), seq: 1 })
      .success,
  ).toBe(false);
  expect(
    inputSchema.safeParse({ kind: "wheel", delta: 1201, seq: 1 }).success,
  ).toBe(false);
  expect(
    qualitySchema.safeParse({
      width: 10000,
      quality: 100,
      fps: 120,
      monitor: 0,
    }).success,
  ).toBe(false);
});
it("maps physical shortcut keys and clamps pointer coordinates", () => {
  expect(virtualKey("ControlRight")).toBe(163);
  expect(virtualKey("ArrowLeft")).toBe(37);
  expect(virtualKey("F12")).toBe(123);
  expect(virtualKey("unknown")).toBeUndefined();
  expect(
    pointInFrame(-5, 300, { left: 0, top: 0, width: 100, height: 100 }),
  ).toEqual({ x: 0, y: 1 });
});
it("requires secure recovery delivery and refuses redirects/failures", async () => {
  expect(recoveryDelivery({ origin: "https://test" })).toBeUndefined();
  expect(() =>
    recoveryDelivery({
      origin: "https://test",
      url: "http://test",
      bearer: "test-only",
    }),
  ).toThrow();
  let sent: any;
  const deliver = recoveryDelivery(
    {
      origin: "https://test",
      url: "https://delivery.test",
      bearer: "test-only",
    },
    (async (_url: any, options: any) => {
      sent = options;
      return new Response("", { status: 200 });
    }) as typeof fetch,
  )!;
  await deliver("user@example.test", "test-token");
  expect(sent.redirect).toBe("error");
  expect(JSON.parse(sent.body).resetUrl).toBe(
    "https://test/reset?token=test-token",
  );
});

it("denies prototype-property role names", () => {
  expect(allowed("constructor", "view")).toBe(false);
  expect(allowed("toString", "control")).toBe(false);
});
