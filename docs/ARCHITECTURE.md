# Architecture and decisions

## Trust boundaries

Browser → same-origin HTTPS API / WSS relay → PostgreSQL. Agent → outbound HTTPS enrollment/proof → outbound WSS relay. The agent runs visibly in an authorized, logged-on user's session with `asInvoker`; it is not a service. Remote sessions can operate while that user is away if the application remains enabled and the normal desktop remains unlocked. Pre-logon unattended access is not implemented.

## Control plane

Login creates an opaque random session stored only as a SHA-256 digest. Each request resolves the authenticated user and the supplied organization membership; built-in role grants are checked independently of the UI. Tenant SQL uses a transaction and local `app.org_id`. Composite FKs prevent cross-tenant group/device/session relationships. Database isolation depends on a non-bypass runtime role; migration/admin credentials must never run the application.

Organizations and global login identities are global tables. Only authorized API routes expose them. Tenant-owned tables enforce RLS. The application role can switch its tenant context by design; RLS complements API authorization, it does not protect against total compromise of the server process. A platform administrator has user-provisioning rights; it does not receive automatic tenant desktop access.

## Engine

1. An owner/admin issues a hashed one-time enrollment token.
2. A visible agent generates RSA-3072 locally, enrolls its public key and pins the server grant-verification key received over authenticated HTTPS.
3. Agent signs a fresh nonce and obtains a one-use socket ticket. An outbound connection registers live presence.
4. Technician requests view/control. Server validates membership, device trust, mode and current availability, stores the session and its permissions.
5. Browser exchanges its authenticated session for a socket ticket. Server sends a signed grant to the agent, which checks signature, identity, organization, mode, protocol and expiry.
6. Agent captures primary screen using GDI `CopyFromScreen`, caps width at 1280, encodes JPEG quality 55 and prefixes the session UUID. Server checks the current DB authorization before forwarding each frame.
7. Browser renders JPEG frames and sends monotonically sequenced normalized input. Server rechecks current session/role/device/login validity; agent rechecks signed grant, mode, sequence, expiry and desktop state before SendInput.
8. Termination, role reduction, logout and device revocation close the viewer and send revocation; transport loss stops local access. Reconnection authenticates afresh and does not resurrect ended sessions.

## Performance

Baseline 5 FPS target, 1–5 FPS adjustment based on local encode/send duration, width cap, frame size cap (2 MiB), one frame being validated at a time, slow-viewer buffer cap and frame dropping. This is a first transport, not a measured performance guarantee. JPEG over TCP has head-of-line blocking. There is no adaptive network estimation, packet-loss recovery, delta codec or H.264 encoder. Relay sees screen plaintext after TLS termination; no E2E media encryption is claimed. Server RTT is displayed separately from unavailable desktop input latency.

## Data and deployment model

A single server process owns the live agent/viewer/ticket maps. Horizontal scaling needs a presence store and relay routing; load-balancing these processes directly will not work. Restart loses live sockets/tickets and requires fresh sessions. PostgreSQL retains identity, session history and audit records. Migration `001` runs under a transaction and advisory lock.

## Scope choices

GDI/JPEG is an explicitly limited baseline. Desktop Duplication or WGC and a standard video transport should be introduced behind capture/transport interfaces after Windows validation. No attempt is made to bypass Session 0, UIPI, UAC, endpoint protection or Windows sign-in. Service/broker integration is deferred rather than represented by a non-functional service.
