# Security assessment — engineering preview

Implemented: Argon2id, random session/ticket/enrollment secrets stored hashed, encrypted TOTP secrets using AES-256-GCM with an external key, verified MFA setup and last-counter checks, strict same-site cookies, strict mutation origins, built-in RBAC, current membership checks, RLS and composite FKs, proof-of-possession and one-time challenges, session mode and sequence checks, revocation, audit of tenant administrative actions, visible agent and DPAPI CurrentUser storage. Production mode sets Secure cookies; termination must supply TLS in deployment.

## Threat model

Protect against a user guessing a different tenant's device ID, a viewer attempting control, replayed enrollment/proof/ticket/input, an untrusted device using another identity, and stale access after role/trust changes. Rate limiting is per process/client IP and is not a substitute for a WAF or account lockout policy. Proxy trust must be configured narrowly; do not blindly trust arbitrary forwarded client IPs.

Trusted: application server, PostgreSQL operator, organization operators authorized to enroll, OS/user profile hosting the agent, TLS PKI and build pipeline. TLS terminator/relay can observe desktop content. Administrators can grant view of organization devices to members. There are no per-device ACLs yet. A compromised logged-on user or machine can access its DPAPI-protected identity; hardware-backed non-exportable keys are not implemented.

## Remaining security work / blockers to production

- Independent review, penetration testing, operational incident response and restore drill.
- Windows interactive capture/input verification, locked-desktop race tests, keyboard layout/extended keys/IME, multi-user session switching and input cleanup under network failure. No UAC/logon control.
- Signed MSI/EXE packaging, code-signing ownership and certificate lifecycle; installer execution/uninstall verification. Installer is per-user, visible in installed applications and Start menu; no hidden service or startup registration.
- Automatic desktop activity indicator inside the remote user's session beyond the visible agent window; per-session local consent policy, device-specific ACLs and organization access policies.
- Production reset-mail transport, MFA recovery codes, reset-token handling policy and forced change of admin-issued temporary passwords.
- Global platform administration audit events, append-only audit enforcement beyond DB-role grants, retention/export and independent tamper evidence. No desktop recording.
- Expired authorization rows without a connected viewer are denied but not eagerly marked ended; retention/cleanup jobs are needed.
- Current data access bounds cap some list sizes; robust pagination, centralized metrics, distributed rate limiting and durable presence/relay routing remain.
- WGC/Desktop Duplication, E2E media encryption, video codecs, network adaptive quality, load/performance measurements and complete input latency measurement.
- Complete OpenAPI request/response schemas, policy/role customization, organization limits and entitlement enforcement.

Never deploy with superuser/BYPASSRLS credentials. Run `app-role.sql` using migration credentials, set its password via a secret-aware tool, and use only the resulting runtime role. Application startup does not seed accounts or devices. Never commit `.env`, server private keys, MFA encryption key or agent identity files. Artifacts/keys and build outputs are excluded by Git.

## Windows references

- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput — SendInput is constrained by UIPI and cannot elevate access.
- https://learn.microsoft.com/en-us/windows/win32/services/interactive-services — Session 0 is not an interactive user desktop.
- https://dotnet.microsoft.com/en-us/platform/support/policy — .NET 10 LTS selected; use a currently serviced patch.

Report vulnerabilities privately to the repository owner; no public disclosure endpoint is configured.
