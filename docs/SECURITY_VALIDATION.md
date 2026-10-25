# 0.3.0 security validation

Engineering review and regression results, not a third-party penetration-test certificate. Scope is this repository and ephemeral owned fixtures only. No school device or external target is tested.

## Changes

- Service SCM lock/logoff/disconnect notifications invalidate session leases; unlock requires a new worker lease. Broker checks active console ID and SID, bounds IPC, verifies worker PID and clears availability on failure. A per-session mutex rejects duplicate workers; a logged-in user can cause local denial of service, not obtain a private key. Private identity stays DPAPI + SYSTEM/Admin DACL.
- LocalDesktop still verifies the signed grant and monotonic input sequence; worker turnover never imports old grants. Loss of interactive availability revokes local authorization; backend closes live viewers and ends database sessions. No UAC/logon bypass.
- Agent registration clears persisted session grants even when the backend has no in-memory old Agent (process restart recovery). One concurrent session per device remains serialized by device row lock; old socket ownership is checked after awaited authorization.
- MFA recovery-set replacement now locks the user row and deletes/inserts inside one transaction. Concurrent generation returns sets, but only the last committed set is valid. Hashes only are stored. Consumption remains one-use and requires the password.
- Device ACL migration 003 adds `terminate` and `devices` operation grants. Role permission remains a ceiling; this does not let a technician elevate into organization admin. Owners/admins remain explicit privileged exceptions. Terminating another user's session additionally requires device `terminate`; own-session termination remains possible. Device revocation checks `devices`. ACL changes end current grants and are audited. Files/clipboard grants are reserved and expose no working endpoint.
- ACK pacing is bounded and socket-owner-scoped; it grants no authority. Relay drops stale frames and limits buffered bytes. Closing a viewer also removes its gate.

## Attack/regression map

| Attempt                                                            | Evidence                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Missing login / wrong password / wrong origin                      | API authentication and CSRF cases.                                                         |
| Viewer enrolling / controlling / managing users                    | RBAC API rejection.                                                                        |
| Cross-tenant IDs and ACL targets                                   | API rejection + native PostgreSQL RLS/composite foreign keys.                              |
| Unregistered or forged device proof / nonce replay / revoked trust | RSA challenge/prove and revoked-device API cases; no key impersonation accepted.           |
| Stolen ticket used with another login                              | Cookie-bound ticket redemption rejected.                                                   |
| Ticket in URL / anonymous socket / reused ticket                   | WebSocket rejection cases.                                                                 |
| Concurrent session starts                                          | Two simultaneous real API calls: one success, one conflict; subsequent starts conflict.    |
| Stale in-flight old viewer input                                   | Suspended DB authorization followed by replacement; old input not forwarded.               |
| Input after DB expiry / ticket after expiry                        | Active socket closes, no input forwarded; fresh ticket rejected.                           |
| Grant after interactive desktop disappears                         | Existing viewer closes; new session conflicts while unavailable.                           |
| Slow decoder / duplicate unsolicited ACK                           | API frame drop/feedback integration + gate bounds unit tests.                              |
| Concurrent MFA regeneration / recovery replay                      | Database-backed API tests prove one whole set of ten, hashed-only and one-use consumption. |
| Pipe impersonation/oversize/network SID                            | Windows native pipe PID, framing, DACL and DPAPI checks.                                   |
| Post-revocation native input                                       | Windows owned-window and real Engine loopback tests.                                       |

Exact successful jobs/counts are recorded in `phase3/CI_VERIFICATION.json`. Mock adapter tests alone are not described as Windows production validation.

## Remaining gates

Service→WTS worker→IPC→relay full path after enrolled-machine reboot; real lock/unlock/logoff/fast-user-switch races; physical multi-monitor/DPI/layout/IME matrix; independent security review; cross-process/horizontal relay coordination; signing certificate lifecycle; real HTTPS recovery provider; retention/export worker and tamper-evidence design. Keys rotate only through operator provisioning/restart, not an automated seamless production rotation service. TLS deployment and Windows-to-Windows remain unvalidated. Relay can see plaintext frames after TLS termination; no end-to-end media encryption claim. Initial locked state relies on the worker's normal-desktop availability check until SCM notifications arrive. Windows administrators are trusted principals; IPC is not a defense against a malicious local administrator.
