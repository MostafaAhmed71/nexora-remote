import { it, expect } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
it("measures loopback transport under delay, bandwidth shaping, frame drops and reconnect", async () => {
  const results = [];
  for (const profile of [
    { name: "baseline", delay: 0, bytesPerSecond: 512000, dropEvery: 0 },
    { name: "weak", delay: 60, bytesPerSecond: 64000, dropEvery: 3 },
  ]) {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    let received = 0;
    const payload = Buffer.alloc(8192, 7);
    const cpu = process.cpuUsage();
    const start = performance.now();
    const open = async () => {
      const socket = new WebSocket(
        "ws://127.0.0.1:" + (server.address() as any).port,
      );
      await once(socket, "open");
      socket.on("message", () => received++);
      return socket;
    };
    server.on("connection", (s) => s.on("message", (data) => s.send(data)));
    let socket = await open();
    let sent = 0;
    for (let i = 1; i <= 6; i++) {
      if (i === 4) {
        socket.close();
        await once(socket, "close");
        await new Promise((r) => setTimeout(r, 80));
        socket = await open();
      }
      await new Promise((r) =>
        setTimeout(
          r,
          profile.delay + (payload.length / profile.bytesPerSecond) * 1000,
        ),
      );
      if (profile.dropEvery && i % profile.dropEvery === 0) continue;
      sent++;
      socket.send(payload);
    }
    while (received < sent) {
      if (performance.now() - start > 10000)
        throw new Error("Transport stalled");
      await new Promise((r) => setTimeout(r, 5));
    }
    const elapsed = (performance.now() - start) / 1000;
    socket.close();
    await once(socket, "close");
    await new Promise<void>((r) => server.close(() => r()));
    expect(received).toBe(profile.dropEvery ? 4 : 6);
    const used = process.cpuUsage(cpu);
    results.push({
      profile: profile.name,
      receivedFrames: received,
      injectedFrameDrops: 6 - sent,
      elapsedSeconds: elapsed,
      receivedFramesPerSecond: received / elapsed,
      receivedKbps: (received * payload.length * 8) / 1000 / elapsed,
      cpuMs: (used.user + used.system) / 1000,
      rssBytes: process.memoryUsage().rss,
      reconnected: true,
      realDesktop: false,
      tcpPacketLossSimulated: false,
    });
  }
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/network-benchmark.json",
    JSON.stringify(
      {
        scope:
          "Synthetic loopback WS application-frame shaping; not measured Windows performance or kernel packet loss",
        results,
      },
      null,
      2,
    ),
  );
}, 30000);
