import { WebSocket, WebSocketServer } from "ws";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
const [mode, profile, target] = process.argv.slice(2);
if (mode === "server") {
  const server = new WebSocketServer({ host: "10.203.0.2", port: 18990 });
  server.on("connection", (s) => s.on("message", (data) => s.send(data)));
} else {
  const socket = new WebSocket("ws://10.203.0.2:18990");
  const cpu = process.cpuUsage(),
    start = performance.now(),
    times = [];
  await once(socket, "open");
  let bytes = 0;
  const payload = Buffer.alloc(8192);
  let sent;
  for (let i = 0; i < 12; i++) {
    sent = performance.now();
    const response = once(socket, "message");
    socket.send(payload);
    const [data] = await Promise.race([
      response,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Netem stalled")), 10000).unref(),
      ),
    ]);
    bytes += data.length;
    times.push(performance.now() - sent);
  }
  const elapsed = performance.now() - start,
    usage = process.cpuUsage(cpu);
  socket.close();
  await once(socket, "close");
  writeFileSync(
    target,
    JSON.stringify(
      {
        profile,
        measured: {
          frames: 12,
          bytes,
          averageFrameBytes: bytes / 12,
          framesPerSecond: 12000 / elapsed,
          elapsedMs: elapsed,
          meanEchoMs: times.reduce((a, b) => a + b, 0) / times.length,
          cpuMs: (usage.user + usage.system) / 1000,
          rssBytes: process.memoryUsage().rss,
        },
        simulated:
          profile === "impaired"
            ? { oneWayDelayMs: 80, kernelPacketLossPercent: 5, rateKbit: 512 }
            : {},
        notMeasured: [
          "Windows capture",
          "encode",
          "mouse-to-photon latency",
          "reboot",
          "two Windows",
        ],
        scope:
          "Real TCP WebSocket echo over isolated veth/netns; netem loss causes TCP retransmission, not guaranteed application frame loss",
      },
      null,
      2,
    ),
  );
}
