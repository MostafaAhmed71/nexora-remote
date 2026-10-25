# Development and verification

No commands are requested of the phone user in this delivery. This document is for a future authorized operator/cloud runner.

## Prerequisites

Node 24, npm lockfile, PostgreSQL 17, .NET 10 SDK for cross compilation; Windows .NET desktop runtime only for framework-dependent development builds. Self-contained Windows publish does not require an installed runtime. Interactive validation requires a real authorized Windows desktop; hosted headless runners do not prove desktop behavior.

## Setup (future operator)

1. `npm ci`. Use a disposable database or dedicated development installation.
2. Start PostgreSQL using `infrastructure/local/compose.yaml`; DB password is explicit, no public port binding.
3. Set migration-only `DATABASE_URL`, then `npm run migrate` from repository root.
4. Execute `infrastructure/local/app-role.sql` as database owner and set a runtime password outside source. Set application `DATABASE_URL` to `nexora_app`; never use the Postgres container's admin account in the application.
5. On an empty installation only, explicit `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD`, migration DB URL and `npm run bootstrap` provision the initial platform administrator and generate local grant keys/MFA encryption key. This script is never invoked automatically. No account has been bootstrapped in this task.
6. Set `MFA_KEY` from the generated key, `SIGNING_KEY_FILE`, `PUBLIC_KEY_FILE`, `ORIGIN`, `DATABASE_URL`; `.env.example` documents names. The runtime expects process environment; it does not automatically load `.env`.
7. `npm run dev` and `npm run dev:web`. Open the local dashboard, sign in, create organization, select it and enroll only an authorized disposable Windows VM later. `HOST` defaults to loopback.
8. Optional Compose `app` profile builds backend/web and binds web to loopback:8080. Set DB URL with hostname `postgres` and the runtime account. Run migration/bootstrap before starting app profile. Compose was authored but not executed here (Docker unavailable).

## Test commands

- `npm run lint`: Prettier formatting and source hygiene/merge-marker/private-key-pattern checks; not a comprehensive secret scanner/SAST product.
- `npm run typecheck`, `npm test`, `npm run build`.
- `npm run test:e2e`: starts isolated in-memory PostgreSQL WASM and real Fastify harness on loopback:3000, Vite on loopback:5173; contains only example.test fixture accounts.
- `node --import tsx tests/postgres.integration.ts`: explicit `TEST_DATABASE_URL` to a disposable PostgreSQL server. Wraps DDL/fixtures in a rollback and exercises RLS under NOSUPERUSER/NOBYPASSRLS. The native PostgreSQL 17 checks passed on GitHub Actions run 40180726012.
- `dotnet build apps/windows-agent/Nexora.Agent/Nexora.Agent.csproj -c Release`.
- `dotnet run --project tests/agent-contract/Agent.Contract.csproj -c Release`.
- `dotnet publish apps/windows-agent/Nexora.Agent/Nexora.Agent.csproj -c Release -r win-x64 --self-contained true -o artifacts/agent`.

Playwright normally installs its Chromium on the runner. In this cloud task CDN download failed, so an independently installed Chromium 153 binary was supplied through `CHROMIUM_EXECUTABLE`; tests ran on it successfully. Linux-only headless flags apply only to the test runner.

## Development data

No production seed exists. Test fixtures live exclusively in `tests/` and are ephemeral. E2E harness refuses `NODE_ENV=production`. Do not expose the harness or its fixture credentials beyond loopback. Schema reference rows (roles/permissions) are migration data, not example organizations/users/devices. Plans and releases remain empty unless an operator provisions them.

## Phase 2 additions

Protocol v2 intentionally rejects v1 URL tickets; update Agent/dashboard together. Run additive migration 002 after 001; the migrator discovers numbered SQL files in order. Existing/new devices now default to enforced ACLs. Runtime grants for the standard nexora_app role are extended by migration 002 if that role already exists.

Machine installer 0.2 requires administrator approval and protected Program Files. It registers an automatic visible NexoraRemote service. Use its Start menu configuration UI for enrollment, never enter Windows credentials. SYSTEM/Admin-only ProgramData machine identity and per-user visible worker are separate. Legacy 0.1 per-user installation/key import is not automated. See phase2/TWO_WINDOWS_KIT.md.

Optional RESET_DELIVERY_URL must be HTTPS and RESET_DELIVERY_BEARER must be supplied as an external secret. The adapter sends email/reset URL to the configured delivery service, refuses redirects, applies a timeout and is not active without configuration. No provider/account has been connected during this task. For MFA recovery, generate codes after password + TOTP and store them privately; each code is consumed once with the password.

Windows validation starts an ephemeral loopback backend and tests only an owned disposable UI window if the runner has a safe interactive desktop. The test records whether it actually ran; no fixed success flag is inferred from buildability. Artifacts include windows-validation.json and synthetic network-benchmark.json. The test-only /**test**/drop-agents route exists solely in the guarded loopback harness, not the application entry point.
