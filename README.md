# NEXORA Remote

Secure Remote Desktop & Device Management Platform — **0.1.0 engineering preview, incomplete**.

This is application source, not a production-ready remote access product. No VPS, deployment, real device enrollment, real user provisioning, or public release has been performed. Repository: https://github.com/MostafaAhmed71/nexora-remote (private). Cloud build/test evidence is recorded under docs; GitHub CI status is tracked separately from interactive Windows verification.

## Implemented

- React/TypeScript/Vite Arabic RTL dashboard, responsive layout and light/dark appearance. Real API-backed login, MFA enrollment, organizations, memberships, roles, device/group lists, enrollment issuance, remote viewer, session history/termination, audit queries, account session revocation, platform-user provisioning and plan/version read views.
- Fastify API with Argon2id, HttpOnly/SameSite cookies, strict origin checks for cookie mutations, rate limits, encrypted TOTP secrets, single-use reset tokens through an injectable delivery adapter, tenant authorization, revocation and structured validation.
- PostgreSQL SQL migration with foreign keys, composite tenant keys, indexes and forced RLS. Explicit transaction-scoped tenant setting; deployment must use a NOSUPERUSER/NOBYPASSRLS runtime role.
- RSA-3072 device identities; single-use ten-minute enrollment tokens; proof-of-possession challenges; fifteen-second single-use socket tickets; RSA-signed five-minute session grants.
- Own engine: visible interactive .NET 10 Windows agent, primary-screen GDI capture, resized JPEG frames, authenticated WebSocket relay, browser canvas viewer, normalized mouse/button/key events through SendInput, sequence checks, grant validation and revocation. No third-party remote desktop engine.
- DPAPI CurrentUser identity storage; reconnect with bounded exponential backoff; presence heartbeat/watchdog; release held input on disconnect/revoke; frame backpressure and a basic capture/send-time FPS adjustment. Viewer counts received frames/bytes and measures server RTT (not end-to-end input latency).
- CI source for Node validation, native PostgreSQL checks, Playwright, Windows build, grant contract checks, self-contained publishing, unsigned Inno Setup installer and artifact uploads. No automatic releases or deployment.

## Verified GitHub CI

[Run #3 — all four jobs succeeded](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40180726012): 28 unit/API/protocol tests, 3 browser tests, 5 native PostgreSQL 17 checks, 5 C# grant checks, web/server build, Windows agent build, unsigned installer creation and isolated silent install/uninstall smoke checks. [Windows build + installer artifact](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40180726012/artifacts/12593293420). This does not verify interactive desktop capture/input. Source-only documentation updates after the tested commit do not change executable behavior.

## Evidence and gaps

See [readiness report](docs/READINESS_AR.md), [architecture](docs/ARCHITECTURE.md), [security](docs/SECURITY.md), [protocol](docs/PROTOCOL.md), [development](docs/DEVELOPMENT.md), [Windows verification](docs/WINDOWS_VALIDATION.md), and [future deployment](docs/DEPLOYMENT.md).

No Windows Service, Session 0 broker, WGC/Desktop Duplication, WebRTC/H.264, secure desktop/logon access, multi-monitor selection, file transfer, clipboard, automatic updates, enforceable commercial licensing, or production password-reset delivery has been completed. Do not interpret a table or route for a future subsystem as a complete feature.

## Layout

- `apps/web`: browser administration and desktop viewer.
- `apps/server`: authentication, tenant API, device proof and relay.
- `apps/windows-agent/Nexora.Agent`: visible per-user agent.
- `packages/database`: PostgreSQL migration and tenant transaction helper.
- `packages/protocol`, `packages/shared`: validation and built-in grants.
- `tests`: isolated test installations and protocol/security checks.
- `infrastructure`: development containers and explicit bootstrap.
- `.github/workflows`: CI configuration for cloud verification.

The workspace uses a single npm lockfile and root build; modules remain separated by directory. A package publishing/workspaces split is deferred until cross-project consumers exist. No empty UI package is included.

## Ownership and third-party software

Original application code is proprietary, all rights reserved; no redistribution license is granted by this repository. Dependencies retain their licenses. See `docs/THIRD_PARTY_LICENSES.md` and their distributed license texts. The engineering Windows build is unsigned and has not been executed on Windows.
