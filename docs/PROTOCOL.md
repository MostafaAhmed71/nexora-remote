# NEXORA Remote Engine protocol v2

Protocol v1 is preserved in phase1/PROTOCOL_v1.md for historical evidence; its URL-ticket clients are intentionally rejected.

## Authorization

REST enrollment remains a 10-minute one-use token tied to organization plus RSA >=3072 public key. Agent signs a fresh 30-second nonce (RSA PKCS#1 v1.5/SHA-256), obtains a one-use 15-second socket ticket and connects with `Authorization: Bearer <ticket>`. Browser receives its own one-use ticket from an authenticated, role/device-ACL-authorized session and connects using subprotocols `nexora.v2`, `ticket.<ticket>`. The response negotiates `nexora.v2`; the ticket is cookie/session/Origin-bound. Never log credential headers. Query ticket credentials are rejected.

Desktop grant format remains `base64url(JSON).base64url(RSA-SHA256 signature over ASCII body)`. Payload: sessionId, deviceId, organizationId, mode, expiresAt (Unix milliseconds), protocol:2. Lifetime is <=5 minutes and no longer than the authorizing login. Broker and worker verify identity, signature, mode, protocol and expiry. Each input is rechecked by the server against login, tenant membership, role, device trust, live session and device ACL. No new authorization is inferred from reconnect.

## Messages

- Agent sends text `ping`; server sends `pong`. Heartbeat is independent of frame processing.
- Agent `{type:"health",interactive,frames,bytes,encodeMs,sessionId}`; server acknowledges `{type:"healthAck"}` and reports availability. Online presence and usable desktop are distinct. No worker/locked desktop is not advertised as a usable screen.
- Viewer receives `{type:"ready",sessionId,mode,expiresAt}` only after authorized handlers are installed.
- Agent binary: 36 ASCII session UUID bytes plus JPEG (<=2 MiB total); server validates current authorization and sends only JPEG to that viewer. Capture/decode are bounded, slow viewers drop complete old frames.
- Viewer input uses positive monotonically increasing seq: release; move x/y in 0..1; button left/right + down; key VK 8..254 + down; wheel delta -1200..1200; text Unicode 1..1024 chars. Server wraps `{type:"input",sessionId,event}`. Active socket ownership is checked before and after awaited authorization, preventing a replaced socket's in-flight operation.
- Viewer `{type:"quality",settings:{width:320..2560,quality:15..85,fps:1..15,monitor:0..31}}`; server validates authorization and bounds before forwarding with sessionId. Worker clamps display selection to actual monitor count. Multi-monitor transitions/DPI remain lab validation gates.
- Viewer ping with numeric sentAt is echoed for browser/server RTT. This is not screen/input end-to-end latency.
- Revoke carries sessionId. Held input is released; failed normal-desktop releases are retained for later retry. Service/worker disconnects do not grant ongoing control. Agent uses bounded exponential backoff+jitter, fresh proof and a fresh desktop session after transport loss.

The local pipe is a separate, length-prefixed JSON channel capped at 3 MiB. Server-created random pipe uses FirstPipeInstance, SYSTEM + target-user SID allow rules, Network SID deny and no Everyone grant. Service verifies the exact launched worker PID; worker verifies the server PID against SCM's registered NexoraRemote service. Private device keys never cross the pipe. Worker receives only public identity and signed grants, validates those independently and runs as the console user, never as an interactive service in Session 0.

Files and clipboard have no enabled message types. Unknown/invalid/oversized control operations fail closed. The relay terminates standard TLS in deployment; E2E media encryption is not claimed. Loopback HTTP is explicitly allowed only for test/development, while production origins must be HTTPS.
