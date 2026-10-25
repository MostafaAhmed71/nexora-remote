# Authorized two-Windows lab kit

This is a future operator procedure; the phone user is not asked to execute commands. No school devices, production account or VPS is used in the delivered tests.

## Preparation

- A: isolated Windows 11 x64 VM with a normal console user and administrator-approved installation. B: a second Windows test machine/browser. Dedicated loopback/LAN development backend, PostgreSQL, exact HTTPS origin and trusted certificate; never disable certificate validation.
- Run migrations in order (001 then 002). Keep migration credentials separate from the NOSUPERUSER/NOBYPASSRLS runtime role. Device ACLs now default to enforced; technicians require explicit grants. Provision only disposable test identities and MFA.
- Download the unsigned 0.2.0 artifact and compare BUILD_ARTIFACTS hashes. Machine setup is administrator-elevated, visible under Installed Apps, Services and Start menu. Do not treat unsigned engineering binaries as a signed commercial release.
- The 0.1 per-user installation is detected and must be removed through Windows Installed Apps first. Automatic identity migration from that profile to SYSTEM is not implemented. New enrollment is explicit; do not copy plaintext keys.

## Operator flow and acceptance

| Step                                                                                                      | Expected evidence                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install A, open machine setup from Start menu and approve normal UAC                                      | Protected Program Files binary; visible automatic NexoraRemote service; no remote access before enrollment                                                                 |
| Owner signs into B, selects test organization, creates one-use enrollment                                 | Ten-minute token tied to that organization; no key exposed                                                                                                                 |
| Enter server origin, organization and token in A's elevated setup; approve the machine access description | DPAPI machine identity persisted under SYSTEM/Admin-only ProgramData ACL; clear device ID; no Windows password requested                                                   |
| Keep normal console user logged on                                                                        | Service starts a visible worker; worker can disable access locally; disabling survives worker restart via per-user opt-out                                                 |
| Give a technician view/control ACL on that device                                                         | No access without organization role AND device permission; changing ACL ends existing grants                                                                               |
| Start viewing from B                                                                                      | Actual screen content; canvas matches frame dimensions; measured FPS/bitrate/server RTT; no invented end-to-end metric                                                     |
| Control a disposable text editor                                                                          | Move/left/right/double click, wheel, key up/down, Ctrl/Shift/Alt, extended keys, Arabic Unicode and IME/physical layout recorded separately                                |
| Change display resolution, DPI, primary monitor and monitor count                                         | Correct screen/cursor alignment at all edges; no stretched mapping; note unsupported combinations                                                                          |
| Change quality and select a monitor                                                                       | Encoded dimensions/FPS respond; no input to a different screen due to stale selection                                                                                      |
| Disable worker, revoke device/ACL, logout, expire grant and terminate session                             | No subsequent authorized frame/input; local held input released; correct audit/state                                                                                       |
| Drop network then restore                                                                                 | Agent authenticates with a new challenge, old session stays ended, new viewer session obtains a fresh grant                                                                |
| Lock Windows, show UAC, switch users                                                                      | No logon/UAC/secure desktop capture or injection. Capture resumes only on an authorized normal desktop; failure is explicit                                                |
| Reboot A and log on                                                                                       | Automatic service reconnect, same protected identity, visible worker. This full reboot/WTS integration remains a required gate                                             |
| Upgrade machine build and uninstall                                                                       | Service is stopped before replacement, machine data retained on repair/upgrade, removal stops/deletes service and machine identity; revoke trust server-side independently |

## Result record

Record installer hash, source commit, Windows build, CPU/RAM/GPU, screen geometry/DPI, role and ACL, network profile, each expected/observed result, actual display FPS/bytes, action-to-observation latency methodology, peak CPU/RSS and logs. Never include passwords, enrollment tokens, session tickets or private keys. Mark `Implemented & Tested` only for the environment actually exercised. A one-runner loopback test is not a two-device/LAN/TLS/reboot test.

Release gate: all critical lab rows pass, independent security review, signing/incident/backup procedures and remaining product gaps closed. Until then this is not approved for institutional or commercial use.
