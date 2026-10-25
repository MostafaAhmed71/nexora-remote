# Future VPS transition — not executed

1. Close Windows interactive and security-review gates first; decide supported Windows versions/keyboard layouts and a visible unattended-access consent policy.
2. Provision a new dedicated environment only after user authorization. Do not reuse unrelated services/repos. Plan backup/restore, monitoring, retention and incident response.
3. Run migrations under a separate owner; configure the restricted runtime role, PostgreSQL network isolation and encrypted backups. Verify forced RLS using the native database integration test.
4. Generate independent server RSA signing keys and MFA encryption key in secret storage. Restrict filesystem access; define rotation, backup and agent re-enrollment procedure. Never reuse ephemeral test/build keys.
5. Configure a valid TLS certificate and HTTPS/WSS reverse proxy; set exact browser ORIGIN and Secure cookies. Permit outbound agent connections. Disable request/query logging of one-time socket tickets and reset tokens. Limit bodies/frames and origin/proxy trust explicitly.
6. Start one backend instance initially because presence/tickets/viewer maps are process-local. Multi-instance rollout requires shared presence, ticket store and relay affinity/routing; no load balancer shortcut is supported.
7. Configure a real reset-delivery adapter; complete MFA recovery, platform audit and entitlement enforcement before commercial service. Create initial administrator using explicit one-time bootstrap in the empty installation.
8. Execute native PostgreSQL, full browser and two-Windows tests over TLS; test logout/revocation, DB outage, service restart and network failure. Establish measured resource limits/load ceilings.
9. Sign and verify installer, deliver only to approved test devices and document uninstall/revocation. No automatic public release; promote manually after review.

No domain, firewall rule, VPS service, production account or public deployment was created during this task.

## Phase 2 deployment gates

Do not deploy directly from the engineering installer. Device ACL enforcement is now default-on; validate the migration/runtime-role grants and explicitly approve technician device access. Configure a real recovery-delivery provider and secret before promising recovery mail. Apply the protocol-v2 upgrade to browser, relay and Agent together. No signing certificate was created.

Machine service setup is explicit and administrator-approved. Full WTS worker launch, protected IPC after machine enrollment/reboot and a two-device trusted HTTPS lab remain gates even though native pipe/DPAPI checks, the direct-agent loopback engine and service install/start/stop/repair/uninstall have automated evidence. No control of UAC/logon/secure desktop is supported. Follow phase2/TWO_WINDOWS_KIT.md and phase2/REPORT_AR.md before planning a pilot.
