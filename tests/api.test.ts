import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID, generateKeyPairSync, createSign } from "node:crypto";
import argon2 from "argon2";
import { TOTP, Secret } from "otpauth";
import { createApp } from "../apps/server/src/app.js";
import { digest } from "../apps/server/src/security.js";
import type { DB } from "../packages/database/index.js";
const origin = "http://localhost:5173",
  a = randomUUID(),
  b = randomUUID(),
  owner = randomUUID(),
  viewer = randomUUID(),
  tech = randomUUID();
let db: PGlite;
let app: Awaited<ReturnType<typeof createApp>>;
let ownerCookie = "",
  viewerCookie = "",
  techCookie = "";
let enroll: any;
let deviceId = "";
let resetToken = "";
const key = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const adapter = (client: any): DB => ({
  query: async (sql, params) => client.query(sql, params),
});
let suspendedRead:
  { id: string; entered: () => void; wait: Promise<void> } | undefined;
const run = async <T>(org: string, fn: (d: DB) => Promise<T>) => {
  const value = await db.transaction(async (tx) => {
    await tx.query("SELECT set_config('app.org_id',$1,true)", [org]);
    return fn(adapter(tx));
  });
  const gate = suspendedRead;
  if (
    gate &&
    (value as any)?.id === gate.id &&
    (value as any)?.auth_session_hash
  ) {
    suspendedRead = undefined;
    gate.entered();
    await gate.wait;
  }
  return value;
};

async function call(
  path: string,
  method: any = "GET",
  payload?: any,
  org = a,
  cookie = ownerCookie,
) {
  return app.inject({
    method,
    url: "/api" + path,
    payload,
    headers: { origin, "x-organization-id": org, cookie },
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    (await readFile("packages/database/migrations/001_initial.sql", "utf8")) +
      (await readFile("packages/database/migrations/002_security.sql", "utf8")),
  );
  await db.exec(
    "CREATE ROLE nexora_app; GRANT USAGE ON SCHEMA public TO nexora_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexora_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO nexora_app;",
  );
  await db.query("INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)", [
    a,
    "A",
    b,
    "B",
  ]);
  for (const [id, email] of [
    [owner, "owner@example.test"],
    [viewer, "viewer@example.test"],
    [tech, "tech@example.test"],
  ])
    await db.query(
      "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",
      [
        id,
        email,
        await argon2.hash("LongTestPassword!23", { type: argon2.argon2id }),
      ],
    );
  await db.query(
    "INSERT INTO memberships VALUES($1,$2,$3),($1,$4,$5),($1,$6,$7),($8,$2,$3)",
    [a, owner, "owner", viewer, "viewer", tech, "technician", b],
  );
  await db.exec("SET ROLE nexora_app");
  app = await createApp({
    db: adapter(db),
    run,
    origin,
    mfaKey: Buffer.alloc(32, 9),
    signingKey: key.privateKey,
    publicKey: key.publicKey,
    deliverReset: async (_email, t) => {
      resetToken = t;
    },
  });
  await app.ready();
  for (const email of ["owner", "viewer", "tech"]) {
    const response = await call("/auth/login", "POST", {
      email: email + "@example.test",
      password: "LongTestPassword!23",
    });
    expect(response.statusCode).toBe(200);
    const cookie = response.headers["set-cookie"]!.toString().split(";")[0];
    if (email === "owner") ownerCookie = cookie;
    else if (email === "viewer") viewerCookie = cookie;
    else techCookie = cookie;
  }
});
afterAll(async () => {
  await app?.close();
  await db?.close();
});
describe("authentication and tenancy", () => {
  it("requires login", async () =>
    expect((await call("/devices", "GET", undefined, a, "")).statusCode).toBe(
      401,
    ));
  it("rejects wrong password", async () =>
    expect(
      (
        await call("/auth/login", "POST", {
          email: "owner@example.test",
          password: "bad",
        })
      ).statusCode,
    ).toBe(401));
  it("cookie is HttpOnly and SameSite strict", async () => {
    const r = await call("/auth/login", "POST", {
      email: "viewer@example.test",
      password: "LongTestPassword!23",
    });
    expect(r.headers["set-cookie"]).toContain("HttpOnly");
    expect(r.headers["set-cookie"]).toContain("SameSite=Strict");
  });
  it("rejects CSRF origin", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: {
        origin: "https://evil.test",
        cookie: ownerCookie,
        "x-organization-id": a,
      },
      payload: { name: "x" },
    });
    expect(r.statusCode).toBe(403);
  });
  it("denies another tenant to non-member", async () =>
    expect(
      (await call("/devices", "GET", undefined, b, viewerCookie)).statusCode,
    ).toBe(403));
  it("RLS prevents unscoped reads and cross-tenant writes", async () => {
    expect((await db.query("SELECT * FROM memberships")).rows).toHaveLength(0);
    await expect(
      run(a, (d) =>
        d.query("INSERT INTO device_groups VALUES($1,$2,$3)", [
          randomUUID(),
          b,
          "forbidden",
        ]),
      ),
    ).rejects.toThrow();
  });
  it("viewer cannot enroll or manage members", async () => {
    expect(
      (await call("/enrollments", "POST", {}, a, viewerCookie)).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          "/members",
          "POST",
          { email: "tech@example.test", role: "admin" },
          a,
          techCookie,
        )
      ).statusCode,
    ).toBe(403);
  });
  it("validates input", async () =>
    expect((await call("/groups", "POST", { name: "" })).statusCode).toBe(400));
  it("creates groups isolated by tenant", async () => {
    expect((await call("/groups", "POST", { name: "Lab A" })).statusCode).toBe(
      200,
    );
    expect((await call("/groups", "GET", undefined, b)).json()).toHaveLength(0);
  });
});
describe("device enrollment and authorization", () => {
  it("issues hashed single-use enrollment", async () => {
    const r = await call("/enrollments", "POST", {});
    expect(r.statusCode).toBe(200);
    enroll = r.json();
    const row = await run(a, (d) =>
      d.query("SELECT token_hash FROM device_enrollments WHERE id=$1", [
        enroll.id,
      ]),
    );
    expect(row.rows[0].token_hash).toBe(digest(enroll.token));
  });
  it("rejects enrollment in another tenant", async () => {
    const r = await call("/agent/enroll", "POST", {
      organizationId: b,
      token: enroll.token,
      name: "test",
      publicKey: key.publicKey,
      os: "Windows test",
      version: "0.1.0",
    });
    expect(r.statusCode).toBe(403);
  });
  it("enrolls device once and rejects replay", async () => {
    const payload = {
      organizationId: a,
      token: enroll.token,
      name: "test device",
      publicKey: key.publicKey,
      os: "Windows test",
      version: "0.1.0",
    };
    const r = await call("/agent/enroll", "POST", payload);
    expect(r.statusCode).toBe(200);
    deviceId = r.json().id;
    expect((await call("/agent/enroll", "POST", payload)).statusCode).toBe(403);
  });
  it("device metadata is tenant scoped", async () => {
    expect((await call("/devices")).json()).toHaveLength(1);
    expect((await call("/devices", "GET", undefined, b)).json()).toHaveLength(
      0,
    );
    expect(
      (await call("/devices/" + deviceId, "DELETE", undefined, b)).statusCode,
    ).toBe(404);
  });
  it("proves device identity with one-time challenge", async () => {
    const n = (await call("/agent/challenge", "POST", { deviceId })).json()
      .nonce;
    const signature = createSign("SHA256")
      .update(n)
      .sign(key.privateKey, "base64");
    const payload = { deviceId, organizationId: a, nonce: n, signature };
    expect((await call("/agent/prove", "POST", payload)).statusCode).toBe(200);
    expect((await call("/agent/prove", "POST", payload)).statusCode).toBe(403);
  });
  it("denies forged device proof", async () => {
    const n = (await call("/agent/challenge", "POST", { deviceId })).json()
      .nonce;
    expect(
      (
        await call("/agent/prove", "POST", {
          deviceId,
          organizationId: a,
          nonce: n,
          signature: "forged",
        })
      ).statusCode,
    ).toBe(403);
  });
  it("rejects control grant to viewer", async () =>
    expect(
      (
        await call(
          "/sessions",
          "POST",
          { deviceId, mode: "control" },
          a,
          viewerCookie,
        )
      ).statusCode,
    ).toBe(403));
  it("rejects offline device and cross-tenant IDOR", async () => {
    expect(
      (await call("/sessions", "POST", { deviceId, mode: "control" }))
        .statusCode,
    ).toBe(409);
    expect(
      (await call("/sessions", "POST", { deviceId, mode: "control" }, b))
        .statusCode,
    ).toBe(404);
  });
  it("records enrollment audit", async () =>
    expect(
      (await call("/audit"))
        .json()
        .some((r: any) => r.event === "device.enrolled"),
    ).toBe(true));
  it("relays authorized frames/input, rejects ticket replay and stale in-flight input after viewer replacement", async () => {
    const { once } = await import("node:events");
    const n = (await call("/agent/challenge", "POST", { deviceId })).json()
      .nonce;
    const signature = createSign("SHA256")
      .update(n)
      .sign(key.privateKey, "base64");
    const proof = (
      await call("/agent/prove", "POST", {
        deviceId,
        organizationId: a,
        nonce: n,
        signature,
      })
    ).json();
    const agent = await app.injectWS("/api/socket", {
      headers: { authorization: "Bearer " + proof.ticket },
    });
    // Wait until asynchronous device validation has attached the handler.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Agent not ready")),
        3000,
      );
      const ping = setInterval(() => agent.send("ping"), 20);
      agent.once("message", () => {
        clearTimeout(timeout);
        clearInterval(ping);
        resolve();
      });
    });
    await db.query(
      "UPDATE auth_sessions SET expires_at=now()+interval '2 minutes' WHERE id_hash=$1",
      [digest(ownerCookie.split("=")[1])],
    );
    const healthAck = new Promise<void>((resolve) => {
      const listener = (data: any) => {
        if (data.toString().includes("healthAck")) {
          agent.off("message", listener);
          resolve();
        }
      };
      agent.on("message", listener);
    });
    agent.send(JSON.stringify({ type: "health", interactive: true }));
    await healthAck;
    const auth = await call("/sessions", "POST", { deviceId, mode: "control" });
    expect(auth.statusCode).toBe(200);
    const sid = auth.json().id;
    expect(auth.json().expiresAt).toBeLessThanOrEqual(Date.now() + 121000);
    await db.query(
      "UPDATE auth_sessions SET expires_at=now()+interval '8 hours' WHERE id_hash=$1",
      [digest(ownerCookie.split("=")[1])],
    );
    const ticket = (
      await call("/sessions/" + sid + "/ticket", "POST", {})
    ).json().ticket;
    const wrongTicket = (
      await call("/sessions/" + sid + "/ticket", "POST", {})
    ).json().ticket;
    const stolen = await app.injectWS("/api/socket", {
      headers: {
        origin,
        cookie: viewerCookie,
        "sec-websocket-protocol": "nexora.v2, ticket." + wrongTicket,
      },
    });
    await once(stolen, "close");
    const grantPromise = once(agent, "message");
    const viewerWs = await app.injectWS("/api/socket", {
      headers: {
        origin,
        cookie: ownerCookie,
        "sec-websocket-protocol": "nexora.v2, ticket." + ticket,
      },
    });
    const grantMessage = JSON.parse((await grantPromise)[0].toString());
    expect(grantMessage.type).toBe("grant");
    expect(grantMessage.grant).toContain(".");
    const replay = await app.injectWS("/api/socket", {
      headers: {
        origin,
        cookie: ownerCookie,
        "sec-websocket-protocol": "nexora.v2, ticket." + ticket,
      },
    });
    const replayClosed = once(replay, "close");
    await replayClosed;
    const frame = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const received = once(viewerWs, "message");
    agent.send(Buffer.concat([Buffer.from(sid), frame]));
    expect(Buffer.from((await received)[0])).toEqual(frame);
    const input = once(agent, "message");
    viewerWs.send(
      JSON.stringify({ kind: "key", code: 65, down: true, seq: 1 }),
    );
    expect(JSON.parse((await input)[0].toString()).event.code).toBe(65);
    const releases = new Promise<any[]>((resolve, reject) => {
      const events: any[] = [];
      const timeout = setTimeout(
        () => reject(new Error("Input queue lost release events")),
        3000,
      );
      const handler = (data: any) => {
        const event = JSON.parse(data.toString());
        if (event.type === "input") {
          events.push(event.event);
          if (events.length === 2) {
            clearTimeout(timeout);
            agent.off("message", handler);
            resolve(events);
          }
        }
      };
      agent.on("message", handler);
    });
    viewerWs.send(
      JSON.stringify({ kind: "key", code: 65, down: false, seq: 2 }),
    );
    viewerWs.send(JSON.stringify({ kind: "release", seq: 3 }));
    expect((await releases).map((e) => e.kind)).toEqual(["key", "release"]);
    // Simulate an authorization read completing just before viewer ownership changes.
    const replacementTicket = (
      await call("/sessions/" + sid + "/ticket", "POST", {})
    ).json().ticket;
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => (enter = r));
    const blocked = new Promise<void>((r) => (release = r));
    suspendedRead = { id: sid, entered: enter, wait: blocked };
    viewerWs.send(
      JSON.stringify({ kind: "key", code: 67, down: true, seq: 4 }),
    );
    await entered;
    const newGrant = once(agent, "message");
    const replacement = await app.injectWS("/api/socket", {
      headers: {
        origin,
        cookie: ownerCookie,
        "sec-websocket-protocol": "nexora.v2, ticket." + replacementTicket,
      },
    });
    expect(JSON.parse((await newGrant)[0].toString()).type).toBe("grant");
    const forwarded = once(agent, "message");
    release();
    replacement.send(
      JSON.stringify({ kind: "key", code: 68, down: true, seq: 1 }),
    );
    expect(JSON.parse((await forwarded)[0].toString()).event.code).toBe(68);
    const closed = once(replacement, "close");
    expect((await call("/sessions/" + sid, "DELETE")).statusCode).toBe(200);
    await closed;
    agent.close();
  });
  it("blocks platform administration and protects cross-tenant device details", async () => {
    expect(
      (await call("/platform/users", "GET", undefined, a, techCookie))
        .statusCode,
    ).toBe(403);
    expect(
      (await call("/devices/" + deviceId, "GET", undefined, b)).statusCode,
    ).toBe(404);
    expect((await call("/devices/" + deviceId)).statusCode).toBe(200);
  });
  it("enforces device ACLs independently from organization RBAC and validates ACL tenants", async () => {
    expect(
      (
        await call(
          "/sessions",
          "POST",
          { deviceId, mode: "view" },
          a,
          viewerCookie,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call("/devices/" + deviceId + "/acl", "PUT", {
          enforced: true,
          entries: [{ userId: randomUUID(), permission: "view" }],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call("/devices/" + deviceId + "/acl", "PUT", {
          enforced: true,
          entries: [{ userId: tech, permission: "view" }],
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          "/sessions",
          "POST",
          { deviceId, mode: "control" },
          a,
          techCookie,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await call("/devices/" + deviceId + "/acl", "GET", undefined, b))
        .statusCode,
    ).toBe(404);
    const acl = (await call("/devices/" + deviceId + "/acl")).json();
    expect(acl.enforced).toBe(true);
    expect(acl.entries[0].permission).toBe("view");
  });
  it("rejects URL credentials and anonymous sockets", async () => {
    const { once } = await import("node:events");
    for (const path of ["/api/socket?ticket=not-a-ticket", "/api/socket"]) {
      const socket = await app.injectWS(path);
      await once(socket, "close");
    }
  });
  it("revokes device trust and rejects fresh proof", async () => {
    expect((await call("/devices/" + deviceId, "DELETE")).statusCode).toBe(200);
    const n = (await call("/agent/challenge", "POST", { deviceId })).json()
      .nonce;
    const signature = createSign("SHA256")
      .update(n)
      .sign(key.privateKey, "base64");
    expect(
      (
        await call("/agent/prove", "POST", {
          deviceId,
          organizationId: a,
          nonce: n,
          signature,
        })
      ).statusCode,
    ).toBe(403);
  });
});
describe("MFA and recovery", () => {
  it("requires verified TOTP before enabling MFA", async () => {
    const setup = (
      await call("/auth/mfa/setup", "POST", {}, a, techCookie)
    ).json();
    expect(
      (
        await call(
          "/auth/mfa/confirm",
          "POST",
          { otp: "xxxxxx" },
          a,
          techCookie,
        )
      ).statusCode,
    ).toBe(400);
    const otp = new TOTP({
      secret: Secret.fromBase32(setup.secret),
    }).generate();
    expect(
      (await call("/auth/mfa/confirm", "POST", { otp }, a, techCookie))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await call("/auth/login", "POST", {
          email: "tech@example.test",
          password: "LongTestPassword!23",
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await call("/auth/login", "POST", {
          email: "tech@example.test",
          password: "LongTestPassword!23",
          otp,
        })
      ).statusCode,
    ).toBe(200);
  });
  it("issues only hashed, one-use MFA recovery codes after password plus TOTP", async () => {
    const row = await db.query("SELECT mfa_secret FROM users WHERE id=$1", [
      tech,
    ]);
    const { unseal } = await import("../apps/server/src/security.js");
    const otp = new TOTP({
      secret: Secret.fromBase32(
        unseal((row.rows[0] as any).mfa_secret as string, Buffer.alloc(32, 9)),
      ),
    }).generate();
    expect(
      (
        await call(
          "/auth/mfa/recovery-codes",
          "POST",
          { password: "wrong", otp },
          a,
          techCookie,
        )
      ).statusCode,
    ).toBe(403);
    const r = await call(
      "/auth/mfa/recovery-codes",
      "POST",
      { password: "LongTestPassword!23", otp },
      a,
      techCookie,
    );
    expect(r.statusCode).toBe(200);
    const codes = r.json().codes;
    expect(codes).toHaveLength(10);
    const stored = await db.query(
      "SELECT code_hash FROM mfa_recovery_codes WHERE user_id=$1",
      [tech],
    );
    expect(stored.rows.map((x: any) => x.code_hash)).toContain(
      digest(codes[0]),
    );
    expect(stored.rows.map((x: any) => x.code_hash)).not.toContain(codes[0]);
    for (const [index, expected] of [200, 401].entries()) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        remoteAddress: "127.0.2.1",
        payload: {
          email: "tech@example.test",
          password: "LongTestPassword!23",
          recoveryCode: codes[0],
        },
      });
      expect(response.statusCode).toBe(expected);
    }
  });
  it("reset token is single-use and invalidates login sessions", async () => {
    expect(
      (await call("/auth/forgot", "POST", { email: "viewer@example.test" }))
        .statusCode,
    ).toBe(200);
    expect(resetToken).not.toBe("");
    expect(
      (
        await call("/auth/reset", "POST", {
          token: resetToken,
          password: "AnotherLongPassword!42",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call("/auth/reset", "POST", {
          token: resetToken,
          password: "AnotherLongPassword!42",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call("/auth/me", "GET", undefined, a, viewerCookie)).statusCode,
    ).toBe(401);
  });
});
