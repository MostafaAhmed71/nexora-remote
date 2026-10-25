# Phase 2 performance evidence and limits

Results are sample measurements in the named CI artifacts, not a product SLA or an assertion of expected school-network performance.

## What is measured

- Browser: decoded frames per sampling second, received JPEG bytes/bitrate, decoded frame dimensions and browser↔server RTT. Decode failure is reported; no invented Windows latency.
- Windows: 20 synthetic 1280×720 solid-color bitmap JPEG encodes scaled to 640×360, wall time, process CPU time, total encoded bytes and process working set. This includes test-process overhead, not isolated service CPU or real animated desktop load.
- Actual Windows loopback engine: GDI desktop marker visible after JPEG relay, actual Arabic text and click applied to the owned test window, encoded-resolution change, revocation and Agent reauthentication. Text action-to-observation time is measured at 50 ms polling granularity; it is not photon latency. Frame bytes reported are sampled frames, not total network accounting.
- Node: real loopback WebSocket echo with producer-side bandwidth pacing, injected delay, frame omission and forced reconnect. Profile baseline: 6 × 8192-byte frames, 512000 byte/s pacing; weak: 64000 byte/s pacing + 60 ms delay, omit every third frame. The test records actual elapsed time, delivered frames/bitrate, process CPU time and RSS. It is application-frame shaping, NOT kernel packet-loss simulation or a claim that TCP drops individual application messages.

Final run 40186778292 recorded real Windows text send-to-observation at 64.6213 ms in one sample (50 ms polling). Synthetic JPEG encode: 20 frames in 866.9536 ms wall, 250 ms aggregate process CPU, 86140 bytes, 49467392 bytes working set. Two sampled desktop frames totalled 56404 bytes. Earlier run 40186322107 recorded 113.3554 ms text observation; this variation is a reason not to treat either sample as a latency guarantee.

The final Node synthetic transport run delivered 6 baseline frames in 0.194706241 s (30.81565 application frames/s, 2019.53465 kbit/s); the weak profile delivered 4 frames and omitted 2 in 1.213953458 s (3.295019 application frames/s, 215.94238 kbit/s). CPU samples were 21.107 ms and 7.998 ms respectively; RSS samples 79843328 and 80629760 bytes. These are loopback producer-shaped messages, not screen FPS or WAN measurements. Raw values are preserved in network-benchmark.json.

## Not measured / not implemented

Two-device/LAN/WAN latency, photon-to-photon delay, real packet loss, long-duration animated desktop CPU/RAM, GPU encoding power/latency, multi-monitor/DPI changes, 8-hour soak, server fan-out capacity and service→WTS worker→IPC end-to-end performance remain unmeasured. Adaptive bitrate, H.264, WebRTC congestion control and GPU capture are not implemented. Current adaptation is only a conservative FPS delay based on observed capture/send duration plus explicit quality/resolution controls. No cross-codec improvement percentage is claimed.

The two-Windows kit defines the next performance matrix. Record hardware, screen/DPI, network shaping tool and configuration, action-to-observation methodology, actual wire bytes, steady-state and peak CPU/RSS, failed/dropped/decoded frames and reconnect time. Do not mix synthetic transport FPS with desktop FPS.
