# Streaming engine 0.3.0 — methodology and decision

## Actual implementation

GDI → JPEG → outgoing authenticated WebSocket → tenant/session-checked relay → Canvas remains the executable path. Capture bitmap is reused until display dimensions change; codec lookup is cached. The producer is sequential and has no frame queue. Sending no longer holds the grant/input mutex. Identical JPEG SHA-256 fingerprints suppress static frames for up to two seconds; capture/encode still run, so this saves transport, not all capture CPU. Fingerprints reset for every grant. A new bitmap is created when actual screen dimensions change.

The browser negotiates decoder acknowledgments with `stream/acks`. Relay permits one unacknowledged frame and drops incoming stale work without storing a queue; buffered bytes plus frame must stay below 2 MiB. A stalled decoder is disconnected after ten seconds when subsequent frames arrive. Legacy test clients without negotiation still have the bounded transport buffer. Browser acknowledges after decode/draw (or failed decode); this is pacing feedback, not proof a human saw a frame or an authorization boundary.

Agent reacts to slow capture/send and relay congestion: at most three downshifts reduce requested width by 15% per step, JPEG quality by 10 and FPS by division; bounds remain width ≥320, quality ≥15 and FPS ≥1. Thirty headroom observations recover one level. Settings remain user ceilings. This is heuristic adaptive JPEG/FPS/resolution, not a network-capacity estimator or WebRTC congestion control. No optimization percentage is assumed.

## Measurements and their meaning

| Metric                                      | Classification / method                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser FPS                                 | Measured decoded/drawn frames per sample second; static-screen suppression deliberately lowers it.                                                |
| Browser bytes/bitrate                       | Measured JPEG payload received; excludes TCP/TLS/IP overhead.                                                                                     |
| Server RTT                                  | Measured browser ping/pong; never mouse-to-Windows or photon latency.                                                                             |
| Capture / encode                            | Measured Agent stopwatch; service-worker capture timing traverses IPC. Unknown before telemetry.                                                  |
| Agent send                                  | Measured wait plus WebSocket send completion; not receiver decode time.                                                                           |
| Actual Windows input                        | Measured send-to-owned-textbox observation on Windows loopback, polling every 50 ms; not photon latency.                                          |
| CPU / memory                                | Measured process CPU and RSS/working set in tests; includes harness overhead, not isolated service telemetry.                                     |
| Loss/delay/rate                             | Simulated via kernel netem in isolated Linux veth/netns; TCP retransmits, application messages need not disappear.                                |
| Reconnect                                   | Agent fresh authorization is functionally tested on Windows; separate Node socket reconnect duration measured. No Windows reconnect-duration SLA. |
| WAN / two Windows / reboot / 8-hour soak    | Not measured.                                                                                                                                     |
| Expected school bandwidth / H.264 advantage | Not estimated.                                                                                                                                    |

`tests/windows-native/CaptureBenchmarks.cs` compares ten real GDI captures using a fresh bitmap per frame against ten with a reused bitmap on the same runner. Both use the current encoder; it is an allocation baseline, not the historical 0.2 binary or an independent codec comparison. Order, JIT, screen contents and scheduler affect results; no universal improvement claim. Synthetic JPEG encoding remains a separate result with `realScreen=false`.

`test-netem.sh` creates a temporary namespace/veth pair with no default route. Echo endpoint binds only `10.203.0.2`; nothing listens publicly. Baseline and impaired runs measure 12 sequential 8192-byte messages; impaired applies 80 ms one-way delay, 5% kernel loss and 512 kbit/s in each direction. `tc -s` output is preserved. This validates TCP transport under actual kernel impairment on Linux, not Windows engine FPS under WAN loss. The scratch container cannot run sudo/network namespaces; this suite runs on GitHub Ubuntu Runner. Separate application-shaping tests measure reconnect and intentional frame omission. Interrupted WebSocket fragmentation test asserts zero partial application messages and a successful fresh complete message after reconnect.

## H.264 / WebRTC decision

Keep GDI/JPEG for this release: it has an executable, validated fallback and the new bounded pipeline can be measured now. Media Foundation H.264 is an actual Windows transform with hardware support dependent on the machine; adopting it requires a complete D3D/color-conversion/encoder lifetime, keyframe/resolution transitions and browser decode path. WebRTC additionally requires ICE/DTLS-SRTP/media-session binding, congestion feedback and tested reconnect/NAT behavior. A codec alone is not that path. No production H.264/WebRTC path is implemented or benchmarked; no comparison numbers are invented.

Primary references reviewed 2026-10-25: [Microsoft H.264 encoder](https://learn.microsoft.com/en-ca/windows/win32/medfound/h-264-video-encoder), [W3C WebRTC](https://www.w3.org/TR/webrtc/), [RFC 8834 media transport](https://www.rfc-editor.org/rfc/rfc8834.html). Revisit after service-worker/two-device/DPI gates, using actual animated workload and controlled GPU/CPU comparisons.

Final run measurements and immutable links are in [PHASE3_REPORT_AR.md](PHASE3_REPORT_AR.md) and `phase3/CI_VERIFICATION.json`.

## Final measured sample — run 40221447469

Source `6c3fdaa3dde3577c61b3aaff6f7d8acb3f1f7599`; [run](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40221447469). Ten real captures per profile; no WAN or service-worker E2E.

| Profile                       | Mean capture ms | Mean JPEG encode ms | Wall ms |  CPU ms | JPEG bytes | Managed allocated bytes | Working set bytes |
| ----------------------------- | --------------: | ------------------: | ------: | ------: | ---------: | ----------------------: | ----------------: |
| allocation-per-frame baseline |          37.425 |              12.806 | 505.814 | 281.250 |     376220 |                  751352 |          69865472 |
| reused capture bitmap         |          33.118 |              12.604 | 458.185 | 203.125 |     376220 |                  766968 |          71163904 |

Capture/CPU samples improved in this run, but managed allocations and working set increased. The optimized path additionally validates authorization/desktop and records timing; GDI/native allocations are not represented fully by managed allocation counts. This does not prove general memory reduction. Screen JPEG payload matched in this sample. Do not infer a product-wide percentage.

Actual Windows textbox send-to-observation: **124.769 ms**, 50 ms polling; not photon latency. Two sampled frames: 52920 bytes. No Windows reconnect duration was measured.

| Linux TCP echo profile | Delivered messages | Payload bytes | Message rate/s | Mean echo ms | Client CPU ms | Client RSS bytes |
| ---------------------- | -----------------: | ------------: | -------------: | -----------: | ------------: | ---------------: |
| baseline               |                 12 |         98304 |        606.159 |        0.988 |        14.711 |         65523712 |
| impaired               |                 12 |         98304 |          1.773 |      536.165 |        20.624 |         65634304 |

The impaired profile configured 80 ms delay + 5% random kernel loss + 512 kbit/s per direction. All 12 application messages arrived via TCP despite packet drops; see netem-qdisc.txt for kernel counters. A separate interrupted-fragment test delivered zero partial messages and one fresh complete message, measuring 2.174 ms for socket reconnect only. High synthetic baseline message rate is not desktop FPS.
