import { it, expect } from "vitest";
import { StreamGate } from "../apps/server/src/stream-gate.js";
it("bounds a slow consumer to one outstanding frame with no stale queue", () => {
  const g = new StreamGate();
  g.acknowledged = true;
  expect(g.allow(0, 1000, 0)).toBe(true);
  for (let i = 1; i <= 100; i++) expect(g.allow(0, 1000, i)).toBe(false);
  expect(g.delivered).toBe(1);
  expect(g.dropped).toBe(100);
  expect(g.ack(300)).toBe(300);
  expect(g.allow(0, 1000, 301)).toBe(true);
  expect(g.stalled(10302)).toBe(true);
});
it("bounds legacy transport buffers and ignores unsolicited duplicate acknowledgments", () => {
  const g = new StreamGate();
  expect(g.ack(0)).toBeNull();
  expect(g.allow(2 * 1024 * 1024 - 100, 101, 0)).toBe(false);
  expect(g.allow(0, 100, 1)).toBe(true);
});
