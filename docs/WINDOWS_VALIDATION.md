# Two Windows device validation gate

**Not yet ready to approve an institutional pilot.** Source and self-contained x64 agent build exist. Runtime behavior has not been tested on Windows. No real school device was contacted.

Future authorized setup: Windows target VM A with a normal logged-on test user and visible agent; Windows device B with a supported browser; a dedicated development backend/PostgreSQL with trusted local HTTPS. Do not disable TLS certificate validation, antivirus or UAC. Install/enable only with explicit authorization. No VPS is necessary for a closed lab; HTTPS trust and connectivity must be established by the lab operator.

Acceptance checklist (all pending):

1. Windows runner builds, installer is generated; inspect hash and signature status. Review unsigned preview warning before use.
2. Installer appears under Installed Apps and Start menu; uninstall removes program files. DPAPI identity removal must be explicitly invoked from agent; server trust revocation remains independent.
3. Enrollment generates local RSA key, consumes token once, shows device ID. Reject expired/wrong-organization token and observe no duplicate identity.
4. Start visible agent manually; dashboard online; heartbeat loss goes offline within ~30 seconds. Disable access immediately stops connection. Restart/reconnect requires new authorization, not old grant replay.
5. View-only session streams a real desktop and never injects input. Control session mouse, left/right buttons and supported keys work in a non-elevated test editor. Type Arabic and English; keyboard layout/IME limitations must be resolved rather than assumed correct.
6. Change primary-screen resolution/DPI during stream; verify frame canvas dimensions and click mapping at all edges. Multiple monitors are not selectable in this version.
7. Revoke trust, change role, logout, end session and let five-minute grant expire; verify no subsequent frame or input, held keys released. Repeat with half-open transport/network loss.
8. Lock Windows, trigger UAC and switch user; agent must deny capture/input without crossing security desktops. No logon control is expected.
9. Observe CPU, memory, FPS, bytes and actual input-to-screen latency on both low- and high-end devices. Exercise throttled network and buffer limits. No performance target is approved yet.
10. Cross-tenant API/device/session probing and session token replays rejected; audit entries correspond to access lifecycle. Complete install/uninstall and reboot behavior; automatic startup/service unattended mode is not present.

Only after passing these tests, security review and addressing high-risk findings should a two-device pilot be marked ready. Existing CI contract tests verify signatures and buildability; they do not substitute for these tests.
