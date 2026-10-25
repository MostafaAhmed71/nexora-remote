# Windows-to-Windows and reboot gate — 0.3.0

**Not executed.** GitHub hosted Windows jobs are separate ephemeral hosts with no provided private routed Windows-to-Windows network or persistent VM/reboot continuation in this account's available tooling. Creating two loopback jobs does not prove two-device connectivity. No public tunnel, public listener, paid VM, VPS or school device was created to work around this. Linux veth namespaces are a network impairment test, not two Windows machines.

Full Windows reboot has not occurred in the tests. SCM stop/start, crash-recovery configuration, lease invalidation and process lifecycle checks are narrower evidence; they are not a reboot result. A persistent authorized Windows VM with a reboot-capable external orchestrator is needed before that claim.

## Future authorized isolated lab

Use two designated disposable Windows x64 machines and a private test backend with a real trusted HTTPS/WSS certificate, no production users or school devices. Agent A uses the signed-grant issuer pinned by enrollment; browser on B must authenticate with MFA and belong to the device's organization/ACL. No bypass of certificate warnings or Windows protection. A lab operator runs the checklist; the phone user is not being asked to execute commands now.

| Case                                          | Expected / acceptance                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresh 0.3 install                             | Visible Installed Apps entry, named automatic service, visible worker and local disable control; no password collection.                                                                   |
| Real 0.2→0.3 upgrade                          | Version 0.3 shown, machine identity preserved, service runs, no duplicate worker, logs preserved.                                                                                          |
| A/B control                                   | B shows marker unique to A; mouse click and Arabic text affect only the owned disposable application on A.                                                                                 |
| View-only                                     | Frames visible; keyboard/mouse commands denied by backend and worker.                                                                                                                      |
| ACL revoke/trust revoke                       | Active session closes, queued/new input rejected, fresh ticket cannot restore denied access.                                                                                               |
| Lock/unlock / logoff/login / fast user switch | Availability clears and grant ends; no secure-desktop capture/input; fresh user lease and fresh grant required. Record transitions and timing.                                             |
| Reboot                                        | Record pre-reboot identity fingerprint/service config, reboot A fully via orchestrator, prove new boot ID, same authorized identity and exactly one suitable worker; fresh grant required. |
| DPI/resolution/monitors                       | Change physical resolution/DPI, include negative monitor origins, verify image dimensions and pointer targets; never count encoded downscaling alone as this test.                         |
| Weak network                                  | Apply documented latency/loss/rate profiles, record actual wire bytes/FPS/capture/encode/send and CPU/RAM. No stale frame queue; bounded recovery.                                         |
| Interrupted delivery                          | Disconnect mid-stream; old input not replayed; reconnect proves identity and obtains a new grant.                                                                                          |
| Removal                                       | Service and machine identity removed; no worker left, subsequent connection rejected.                                                                                                      |

Record hardware/OS/Agent SHA, browser, network topology and certificate, boot identifiers, observer, screenshots of owned test windows, logs scrubbed of credentials, measured reconnect time and input-to-observation method. Separate Passed/Failed/Not Run for each case. No institutional/sale readiness until these gates, security review and long-run stability pass. See the detailed [Phase 2 lab checklist](phase2/TWO_WINDOWS_KIT.md), updated by this gate's stricter 0.3 expectations.
