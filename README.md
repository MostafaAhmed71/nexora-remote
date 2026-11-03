# NEXORA Remote

## Unreleased local master-management additions

The `/master` dashboard adds bulk grouping, time packages, timers, cooperative screen locking, room maps and consented file transfers (10 MiB per file). Apply migration 004 and use the updated Windows agent with explicit local management consent. Classroom profiles currently provide a guided app/site launcher, **not secure exam isolation or an OS-enforced allowlist**. See [the implementation and limits](docs/MASTER_MANAGEMENT_AR.md). The historical 0.3 CI evidence below does not validate these new changes.

**0.3.0 engineering preview — Phase 3. Not approved for institutional use or sale.**

Continue the existing private repository: https://github.com/MostafaAhmed71/nexora-remote . No VPS, public deployment, school device or production identity has been used. Large build outputs live in Actions Artifacts, not Git.

## Phase 3

Read the [Arabic execution and validation report](docs/PHASE3_REPORT_AR.md), [streaming/network methodology](docs/STREAMING_BENCHMARKS.md), [security validation](docs/SECURITY_VALIDATION.md), [Windows two-device/reboot gates](docs/WINDOWS_TWO_DEVICE_TEST.md) and [0.3 readiness](docs/RELEASE_0.3.0_READINESS.md). The exact final tested commit and artifacts are recorded in `docs/phase3/CI_VERIFICATION.json`. Phase 2 evidence below remains historical.

0.3 adds session-lease invalidation, per-session worker ownership, capture bitmap reuse, one-outstanding-frame browser ACK pacing, heuristic adaptive FPS/resolution/JPEG, static JPEG suppression, transactional recovery-set replacement, scoped technician device management, actual 0.2→0.3 upgrade and independent fresh-0.3 install tests, plus isolated kernel netem impairment. Files/clipboard and advanced codecs remain disabled/absent. Full enrolled service-worker, reboot and two Windows are not validated.

## Phase 2 results (historical)

The Windows validation suite has exercised actual GDI desktop capture, JPEG relay through the real Fastify server, actual Arabic Unicode SendInput, a mouse click in an owned test window, encoded-resolution scaling, session revocation and automatic Agent proof/reconnect on a disposable Windows runner with a loopback backend. It is not a two-device/LAN/TLS or service-to-WTS-worker end-to-end test.

Read the [Phase 2 report](docs/phase2/REPORT_AR.md), [machine-readable CI evidence](docs/phase2/CI_VERIFICATION.json), [security review](docs/phase2/SECURITY_REVIEW.md), [capture decision](docs/phase2/ENGINE_DECISION.md), [performance methodology](docs/phase2/PERFORMANCE.md) and [two-Windows lab kit](docs/phase2/TWO_WINDOWS_KIT.md). Phase 1 evidence remains historical under its original reports.

## Executable components

| Component          | Implementation                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web                | React/TypeScript/Vite, Arabic RTL, responsive light/dark dashboard, device ACL editor, MFA recovery, live viewer with fullscreen/fit/frame size, quality/FPS/width/monitor controls, measured receive FPS/bitrate/server RTT and reauthorization/reconnect |
| Server             | Fastify, PostgreSQL migrations, Argon2id/TOTP/one-use recovery codes, strict cookie origins, role + live device ACL, cookie-bound one-use socket tickets outside URLs, signed expiring grants, live-session input/frame checks                             |
| Machine service    | Same protected Windows binary under `--service`: visible automatic NexoraRemote service, SYSTEM/Admin DPAPI machine identity, heartbeat/reconnect, structured bounded logs and SCM recovery                                                                |
| Interactive worker | `--worker`: visible console-user window, local persistent opt-out, GDI/JPEG and SendInput, independently verified signed grants, bounded named-pipe messages bound to process identity and restricted SID ACL                                              |
| Setup              | Administrator-approved Program Files installer, Start menu service configuration (`--configure-service`), start/stop/repair/uninstall tests; still unsigned                                                                                                |

No third-party desktop engine is used. WGC/DXGI, H.264, WebRTC, file transfer and clipboard are not implemented. File/clipboard controls are explicitly disabled. UAC, secure desktop, elevated-app bypass and Windows logon control are unsupported. Multi-user/RDP policy, actual reboot/WTS worker lifecycle, physical resolution/DPI/monitor changes, complete IME behavior, production recovery-provider configuration and independent security review remain validation/product gates.

## Development and protocol

A single root npm lockfile and module-separated monorepo are preserved. `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; `npm run test:e2e` starts only ephemeral loopback fixtures. Windows native and installer suites run in Actions. See [development](docs/DEVELOPMENT.md), [deployment](docs/DEPLOYMENT.md) and [protocol v2](docs/PROTOCOL.md).

Migration 001 is preserved. Migration 002 adds forced-RLS device ACLs and hashed recovery codes. ACL enforcement defaults to enabled for legacy and new devices: owner/admin still need their tenant role, technicians additionally need explicit device grants. Run migrations with an owner role and the server with NOSUPERUSER/NOBYPASSRLS credentials. Never commit keys or `.env`.

Protocol v1 clients/URL tickets are rejected. Upgrade Agent and dashboard together. The old per-user 0.1 installation requires explicit removal/re-enrollment before the machine-service installer; no silent key import occurs. The current upgrade smoke test verifies repair/reinstall of the machine-service build, not automatic legacy conversion.

Original source is proprietary; third-party licenses and Microsoft runtime notices are preserved. The current workflows pin supported Node 24 Actions by commit SHA and do not publish Releases or deploy.
