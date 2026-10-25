# Current Windows validation gates

Phase 2 supersedes Phase 1's build-only status. Actual desktop capture, JPEG relay, Arabic Unicode input, mouse click, scaling, revocation and automatic direct-Agent reconnect have been exercised in an isolated Windows runner/loopback environment. Service install/start/stop/repair/uninstall and native pipe/DPAPI checks are separate automated gates.

This is not a full machine-service→WTS worker→IPC→remote browser validation after enrollment/reboot, and it is not a two-Windows/LAN/TLS test. Secure desktop/UAC/logon are unsupported.

Use [the current two-Windows kit](phase2/TWO_WINDOWS_KIT.md), [classification report](phase2/REPORT_AR.md), [CI evidence](phase2/CI_VERIFICATION.json) and [artifact hashes](BUILD_ARTIFACTS.json). The remaining lab cases include RDP/multi-user policy, physical display/DPI/monitor changes, full IME/shortcuts, long soak, network loss and independent security review. No school device is approved for this engineering validation.
