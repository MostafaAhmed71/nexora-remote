# Engine protocol v1

All non-loopback transport requires HTTPS/WSS. Certificates use platform validation; the agent never installs an accept-all TLS callback. Do not place tickets in proxy access logs. No custom cryptography is used.

- `POST /api/enrollments`: authenticated device-management grant; returns enrollment ID, organization ID, 256-bit token and `expiresIn:600`. Only its SHA-256 digest is stored. Enrollment redemption uses an atomic update in the device-creation transaction.
- `POST /api/agent/enroll`: `{organizationId,token,name,publicKey,os,version}`. Only RSA >=3072 keys accepted. Returns device ID and server SPKI public PEM. Enrollment pins the grant key; rotation/re-enrollment policy remains future work.
- `POST /api/agent/challenge`: `{deviceId}` → random nonce, thirty-second lifetime.
- `POST /api/agent/prove`: `{organizationId,deviceId,nonce,signature}`. Signature is standard RSA-PKCS1-v1_5 SHA-256 over UTF-8 nonce, base64 encoded. Nonce consumed even on failed proof; ticket lifetime fifteen seconds.
- `POST /api/sessions`: `{deviceId,mode:"view"|"control"}`. Current login/role/tenant/device trust required. At most one unexpired session per device while the device row is locked.
- `POST /api/sessions/:id/ticket`: only the creating user, current view grant and matching organization. Single use.
- `GET /api/socket?ticket=...`: consumes the hashed ticket. Agent ticket and viewer ticket have distinct server-held roles. No durable credential in a URL.
- Server grant: JSON `{type:"grant",grant:"body.signature"}`. Body is base64url UTF-8 JSON `{sessionId,deviceId,organizationId,mode,expiresAt,protocol:1}`; signature is RSA-PKCS1-v1_5 SHA-256 over ASCII body, base64url. Agent rejects expiry beyond 301 seconds, invalid identity/mode or protocol.
- Agent binary frame: 36 ASCII UUID bytes followed by JPEG; total <=2 MiB. Server strips UUID and forwards JPEG only to that session's viewer, after database validation. No arbitrary message routing destination supplied by viewer.
- Input: `{kind:"move",x:0..1,y:0..1,seq}`, `{kind:"button",button:"left"|"right",down,seq}`, `{kind:"key",code:8..254,down,seq}`, `{kind:"release",seq}`. Server wraps as `{type:"input",sessionId,event}`. Both peers reject duplicate/decreasing sequences; only control grants execute input.
- Server revoke: `{type:"revoke",sessionId}`. Agent releases held keys/buttons, clears grant. No frame/input accepted after DB expiry/revocation.
- Agent `ping` every ten seconds → server `pong`; thirty seconds without ping closes presence.
- Viewer `{type:"ping",sentAt:number}` → `{type:"pong",sentAt}` measures browser/server RTT, not agent latency.

Disconnected desktop sessions end. Agent reconnects automatically; user must request a fresh authorized desktop session. Transparent session resumption is intentionally not claimed.

REST reference is generated at `/api/docs` and `/api/docs/json`. Runtime request validation uses Zod; generated OpenAPI body/response schemas are incomplete and require expansion before SDK generation. API lists are capped for sessions/audit/users but cursor pagination is not yet available.
