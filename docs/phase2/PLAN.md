# Phase 2 execution plan

Continue the existing private repository; preserve migration 001 and compatibility where safe.

1. Audit executable source against the Phase 1 evidence. Add regression tests for proven authorization, socket ownership and lifecycle failures. Remove URL tickets and close stale sockets.
2. Introduce a machine-scoped Windows service, a visible per-user desktop worker and authenticated, bounded local named-pipe IPC. Add service lifecycle/IPC/installer tests without assuming Session 0 is interactive.
3. Improve the working GDI/JPEG fallback with explicit quality/FPS/resolution budgets, bounded transport/decode, real measured metrics, monitor selection and complete input events. Evaluate WGC/DXGI/video as separate validated upgrades.
4. Extend device ACLs, one-use MFA recovery and a production recovery-delivery adapter. Add regression tests, migration upgrade coverage and revocation checks.
5. Improve viewer controls and reconnection, package and test Windows service install/upgrade/uninstall, run CI and record measured evidence. Prepare a two-device validation kit. Mark unvalidated interactive behavior and file/clipboard gaps honestly.

No VPS, public deployment, school devices, production identities, automatic Releases or large binaries in Git. No Windows interactive environment is assumed available; hosted builds are not a substitute for desktop validation.
