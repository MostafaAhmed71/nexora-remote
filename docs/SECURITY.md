# Current security assessment

See [Phase 2 source/security review](phase2/SECURITY_REVIEW.md) for confirmed defects, fixes and regression mapping. Phase 1 evidence remains historical; this is not an independent penetration test.

Implemented controls: Argon2id, HttpOnly/SameSite cookies, strict mutation/browser socket Origin, hashed one-use enrollment/proof tickets and MFA recovery codes, encrypted TOTP secrets, role plus forced-RLS device ACL, composite tenant keys, login-bound socket tickets outside URLs, current-socket authorization before/after awaited work, signed expiring grants bounded to the authorizing login, bounded input/frame/IPC queues and explicit revocation.

Windows machine identity is DPAPI LocalMachine plus SYSTEM/Admin-only ProgramData DACL. The visible console-user worker has no private machine key. Its local pipe rejects Network SID, does not allow Everyone, binds the launched worker PID and verifies the server against the SCM process. Program Files/reparse checks protect service registration; another executable using the same service name is not silently reconfigured. These controls do not override Windows UAC/UIPI/Session 0 or protect against a compromised administrator.

The service and worker are visible, stoppable and removable; worker can persist a local opt-out. There is no hidden startup, Windows password storage or endpoint-protection bypass. File transfer and clipboard are disabled, not represented as production capabilities.

Remaining gates: full machine-enrollment/reboot/WTS/IPC integration, two-device trusted TLS validation, physical display and lock/UAC races, independent audit and penetration testing, MFA recovery generation concurrency review, complete global authentication/platform audit, stale-session cleanup after backend restart (existing rows can block a new grant until expiry), retention/export/tamper evidence, signing and key rotation policy, production recovery-provider configuration and restore/incident drills. The relay can read frames after TLS termination; no E2E media encryption claim is made. Use a NOSUPERUSER/NOBYPASSRLS runtime database role and external secrets. No production deployment has been performed.
