# 0.3.0 engineering-preview readiness

This is an engineering preview, not a production Release or institutional/sale approval. Source remains the original private monorepo. No deployment or production account was created.

Acceptance requires the final exact source commit to pass builds, API/security/tenant tests, PostgreSQL integration, Windows native capture/input/reconnect tests, available SCM/IPC checks, old-version upgrade, installer build and measured evidence. Read [the Arabic report](PHASE3_REPORT_AR.md) and immutable CI JSON before asserting completion. A later docs-only commit must not be represented as newly tested executable code.

Status vocabulary: **Implemented & Validated** refers only to the named test scope; **Implemented but Not Validated** has code but no sufficient end-to-end result; **Partially Implemented** has explicit gaps; **Not Implemented** is disabled/absent. Green CI alone is not two-device verification.

Mandatory remaining gates: full enrolled service-worker path, reboot, Windows-to-Windows/TLS, actual lock/logoff/user switching and multi-monitor/DPI/IME, independent security review, long-run CPU/RAM/latency/relay-capacity soak. File transfer, clipboard, WGC/DXGI/H.264/WebRTC remain absent. File/clipboard controls remain disabled. Recovery-provider connection, audit retention worker, code signing, automated rollback and seamless key rotation remain incomplete. Installer is unsigned; tested upgrade is in-place from a newly built immutable 0.2 source, not a previously signed customer binary. There is no supported automated rollback claim.

For future deployment only after gates: trusted TLS reverse proxy with authenticated WSS, restricted PostgreSQL runtime role and tested restore, external secrets and rotation, recovery provider, metrics/alerts, audit retention/export, load/capacity and single-node failure testing. Do not open a public test port to skip these requirements.

Final executable source `6c3fdaa3dde3577c61b3aaff6f7d8acb3f1f7599` passed all five jobs in [run 40221447469](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40221447469). Engineering-preview build/CI gates passed in that scope. Windows two-host, reboot and full enrolled service-worker gates remain open.
