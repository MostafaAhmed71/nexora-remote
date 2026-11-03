import Fastify from "fastify";
import { registerManagement } from "./management.js";
import { StreamGate } from "./stream-gate.js";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { z, ZodError } from "zod";
import argon2 from "argon2";
import { randomUUID, createPublicKey } from "node:crypto";
import { TOTP, Secret } from "otpauth";
import type { WebSocket } from "ws";
import type { DB } from "../../../packages/database/index.js";
import { allowed } from "../../../packages/shared/index.js";
import {
  inputSchema,
  qualitySchema,
  MAX_FRAME_BYTES,
} from "../../../packages/protocol/index.js";
import {
  token,
  digest,
  seal,
  unseal,
  signGrant,
  verifyProof,
} from "./security.js";
type Run = <T>(org: string, fn: (db: DB) => Promise<T>) => Promise<T>;
type Options = {
  db: DB;
  run: Run;
  origin: string;
  mfaKey: Buffer;
  signingKey: string;
  publicKey: string;
  production?: boolean;
  deliverReset?: (email: string, token: string) => Promise<void>;
};
const uuid = z.string().uuid();
const fail = (code: number, message: string) =>
  Object.assign(new Error(message), { statusCode: code });
const one = async (db: DB, q: string, p: any[] = []) =>
  (await db.query(q, p)).rows[0];
export async function createApp(o: Options) {
  if (o.mfaKey.length !== 32) throw new Error("MFA key must be 32 bytes");
  if (o.production && !o.origin.startsWith("https://"))
    throw new Error("Production origin requires HTTPS");
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "warn",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.sec-websocket-protocol",
        "res.headers.set-cookie",
      ],
    },
    bodyLimit: 64 * 1024,
  });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip ?? "unknown",
  });
  await app.register(websocket, {
    options: {
      maxPayload: MAX_FRAME_BYTES,
      handleProtocols: (protocols) =>
        protocols.has("nexora.v2") ? "nexora.v2" : false,
    },
  });
  await app.register(swagger, {
    openapi: { info: { title: "NEXORA Remote API", version: "0.3.0" } },
  });
  await app.register(swaggerUI, { routePrefix: "/api/docs" });
  const agents = new Map<string, WebSocket>();
  const interactive = new Map<string, boolean>();
  const viewers = new Map<string, WebSocket>();
  const streamGates = new Map<string, StreamGate>();
  const sessionDevices = new Map<string, string>();
  const challenges = new Map<
    string,
    { device: string; org: string; expires: number }
  >();
  const tickets = new Map<
    string,
    { side: "agent" | "viewer"; id: string; expires: number; authHash?: string }
  >();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of challenges) if (v.expires < now) challenges.delete(k);
    for (const [k, v] of tickets) if (v.expires < now) tickets.delete(k);
  }, 10000);
  sweep.unref();
  const closeSession = (s: string) => {
    viewers.get(s)?.close(1000, "Session ended");
    viewers.delete(s);
    streamGates.delete(s);
    const device = sessionDevices.get(s);
    const agent = device ? agents.get(device) : undefined;
    if (agent?.readyState === 1)
      agent.send(JSON.stringify({ type: "revoke", sessionId: s }));
    sessionDevices.delete(s);
  };
  app.addHook("onClose", async () => {
    clearInterval(sweep);
    for (const a of agents.values()) a.close();
    for (const v of viewers.values()) v.close();
  });
  app.setErrorHandler((e, _req, reply) => {
    const err = e as Error & { statusCode?: number };
    reply.code(e instanceof ZodError ? 400 : (err.statusCode ?? 500)).send({
      error:
        e instanceof ZodError
          ? "Invalid request"
          : err.statusCode && err.statusCode < 500
            ? err.message
            : "Internal server error",
    });
  });
  app.addHook("onRequest", async (req) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.cookies.nr_session &&
      req.headers.origin !== o.origin
    )
      throw fail(403, "Invalid origin");
  });
  async function user(req: any) {
    const raw = req.cookies.nr_session;
    if (!raw) throw fail(401, "Login required");
    const u = await one(
      o.db,
      "SELECT u.id,u.email,u.mfa_secret,u.platform_admin,s.expires_at AS auth_expires_at FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=$1 AND s.expires_at>now()",
      [digest(raw)],
    );
    if (!u) throw fail(401, "Session expired");
    return u;
  }
  async function scope(req: any, permission?: string) {
    const u = await user(req);
    const org = uuid.parse(req.headers["x-organization-id"]);
    const member = await o.run(org, (db) =>
      one(db, "SELECT role FROM memberships WHERE org_id=$1 AND user_id=$2", [
        org,
        u.id,
      ]),
    );
    if (!member || (permission && !allowed(member.role, permission)))
      throw fail(403, "Permission denied");
    return { u, org, role: member.role };
  }
  async function audit(
    db: DB,
    org: string,
    actor: string | null,
    event: string,
    target?: string,
  ) {
    await db.query(
      "INSERT INTO audit_logs(org_id,actor_id,event,target_id) VALUES($1,$2,$3,$4)",
      [org, actor, event, target ?? null],
    );
  }
  async function endUserSessions(userId: string) {
    const orgs = (await o.db.query("SELECT id FROM organizations")).rows;
    for (const org of orgs)
      await o.run(org.id, async (db) => {
        const ended = await db.query(
          "UPDATE remote_sessions SET state='ended',ended_at=now() WHERE org_id=$1 AND user_id=$2 AND state<>'ended' RETURNING id",
          [org.id, userId],
        );
        for (const row of ended.rows) closeSession(row.id);
      });
  }
  app.get("/api/health", async () => ({ status: "ok", protocol: 2 }));
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const b = z
        .object({
          email: z.email(),
          password: z.string().max(256),
          otp: z.string().optional(),
          recoveryCode: z.string().max(128).optional(),
        })
        .parse(req.body);
      const u = await one(o.db, "SELECT * FROM users WHERE email=$1", [
        b.email.toLowerCase(),
      ]);
      if (!u || !(await argon2.verify(u.password_hash, b.password)))
        throw fail(401, "Invalid credentials");
      if (u.mfa_secret) {
        if (b.recoveryCode) {
          const consumed = await o.db.query(
            "UPDATE mfa_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING code_hash",
            [u.id, digest(b.recoveryCode)],
          );
          if (!consumed.rows.length) throw fail(401, "Invalid recovery code");
        } else {
          const t = new TOTP({
            secret: Secret.fromBase32(unseal(u.mfa_secret, o.mfaKey)),
          });
          if (!b.otp || t.validate({ token: b.otp, window: 0 }) === null)
            throw fail(401, "MFA code required or invalid");
          const counter = Math.floor(Date.now() / 30000);
          const used = await o.db.query(
            "UPDATE users SET mfa_counter=$1 WHERE id=$2 AND (mfa_counter IS NULL OR mfa_counter<$1) RETURNING id",
            [counter, u.id],
          );
          if (!used.rows.length) throw fail(401, "MFA code already used");
        }
      }
      const s = token();
      await o.db.query(
        "INSERT INTO auth_sessions(id_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
        [digest(s), u.id],
      );
      reply.setCookie("nr_session", s, {
        httpOnly: true,
        secure: !!o.production,
        sameSite: "strict",
        path: "/",
        maxAge: 28800,
      });
      return { id: u.id, email: u.email };
    },
  );
  app.get("/api/auth/me", async (req) => {
    const u = await user(req);
    return { id: u.id, email: u.email, mfaEnabled: !!u.mfa_secret };
  });
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.cookies.nr_session) {
      const current = await user(req);
      await o.db.query("DELETE FROM auth_sessions WHERE id_hash=$1", [
        digest(req.cookies.nr_session),
      ]);
      await endUserSessions(current.id);
    }
    reply.clearCookie("nr_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/auth/sessions", async (req) => {
    const u = await user(req);
    return (
      await o.db.query(
        "SELECT id_hash,created_at,expires_at FROM auth_sessions WHERE user_id=$1",
        [u.id],
      )
    ).rows;
  });
  app.delete("/api/auth/sessions", async (req) => {
    const u = await user(req);
    await o.db.query("DELETE FROM auth_sessions WHERE user_id=$1", [u.id]);
    await endUserSessions(u.id);
    return { ok: true };
  });
  app.post(
    "/api/auth/forgot",
    { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (req) => {
      const b = z.object({ email: z.email() }).parse(req.body);
      if (!o.deliverReset)
        throw fail(503, "Password reset delivery is not configured");
      const u = await one(o.db, "SELECT id FROM users WHERE email=$1", [
        b.email.toLowerCase(),
      ]);
      if (u) {
        const t = token();
        await o.db.query(
          "INSERT INTO password_resets VALUES($1,$2,now()+interval '15 minutes',NULL)",
          [digest(t), u.id],
        );
        await o.deliverReset(b.email, t);
      }
      return { ok: true };
    },
  );
  app.post("/api/auth/reset", async (req) => {
    const b = z
      .object({
        token: z.string().min(32),
        password: z.string().min(12).max(256),
      })
      .parse(req.body);
    const row = await one(
      o.db,
      "UPDATE password_resets SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id",
      [digest(b.token)],
    );
    if (!row) throw fail(400, "Invalid reset token");
    await o.db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
      await argon2.hash(b.password, { type: argon2.argon2id }),
      row.user_id,
    ]);
    await o.db.query("DELETE FROM auth_sessions WHERE user_id=$1", [
      row.user_id,
    ]);
    await endUserSessions(row.user_id);
    return { ok: true };
  });
  app.post("/api/auth/mfa/setup", async (req) => {
    const u = await user(req);
    if (u.mfa_secret) throw fail(409, "MFA already enabled");
    const t = new TOTP({ issuer: "NEXORA Remote", label: u.email });
    await o.db.query(
      "UPDATE users SET pending_mfa=$1,pending_mfa_expires=now()+interval '10 minutes' WHERE id=$2",
      [seal(t.secret.base32, o.mfaKey), u.id],
    );
    return { uri: t.toString(), secret: t.secret.base32 };
  });
  app.post(
    "/api/auth/mfa/confirm",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req) => {
      const u = await user(req);
      const b = z.object({ otp: z.string().length(6) }).parse(req.body);
      const row = await one(
        o.db,
        "SELECT pending_mfa FROM users WHERE id=$1 AND pending_mfa_expires>now()",
        [u.id],
      );
      if (
        !row?.pending_mfa ||
        new TOTP({
          secret: Secret.fromBase32(unseal(row.pending_mfa, o.mfaKey)),
        }).validate({ token: b.otp, window: 0 }) === null
      )
        throw fail(400, "Invalid MFA code");
      await o.db.query(
        "UPDATE users SET mfa_secret=pending_mfa,pending_mfa=NULL WHERE id=$1",
        [u.id],
      );
      return { ok: true };
    },
  );
  app.post(
    "/api/auth/mfa/recovery-codes",
    { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (req) => {
      const u = await user(req);
      const b = z
        .object({ password: z.string().max(256), otp: z.string().length(6) })
        .parse(req.body);
      const row = await one(
        o.db,
        "SELECT password_hash,mfa_secret FROM users WHERE id=$1",
        [u.id],
      );
      if (
        !row.mfa_secret ||
        !(await argon2.verify(row.password_hash, b.password)) ||
        new TOTP({
          secret: Secret.fromBase32(unseal(row.mfa_secret, o.mfaKey)),
        }).validate({ token: b.otp, window: 0 }) === null
      )
        throw fail(403, "Password and MFA required");
      const codes = Array.from({ length: 10 }, () => token().slice(0, 24));
      // Global auth tables, serialized by the user row inside one transaction.
      await o.run(u.id, async (db) => {
        await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
        await db.query("DELETE FROM mfa_recovery_codes WHERE user_id=$1", [
          u.id,
        ]);
        for (const code of codes)
          await db.query(
            "INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)",
            [u.id, digest(code)],
          );
      });
      return { codes };
    },
  );
  async function deviceAllowed(
    db: DB,
    org: string,
    device: string,
    userId: string,
    permission: string,
  ) {
    return !!(await one(
      db,
      "SELECT d.id FROM devices d JOIN memberships m ON m.org_id=d.org_id AND m.user_id=$3 WHERE d.org_id=$1 AND d.id=$2 AND d.revoked_at IS NULL AND (NOT d.acl_enforced OR m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM device_acl a WHERE a.org_id=d.org_id AND a.device_id=d.id AND a.user_id=$3 AND a.permission=$4))",
      [org, device, userId, permission],
    ));
  }
  app.put("/api/devices/:id/acl", async (req) => {
    const { org, u } = await scope(req, "devices");
    const id = uuid.parse((req.params as any).id);
    const b = z
      .object({
        enforced: z.boolean(),
        entries: z
          .array(
            z.object({
              userId: uuid,
              permission: z.enum([
                "view",
                "control",
                "terminate",
                "devices",
                "clipboard",
                "files",
              ]),
            }),
          )
          .max(200),
      })
      .parse(req.body);
    return o.run(org, async (db) => {
      if (
        !(await one(
          db,
          "SELECT id FROM devices WHERE org_id=$1 AND id=$2 FOR UPDATE",
          [org, id],
        ))
      )
        throw fail(404, "Device not found");
      for (const entry of b.entries)
        if (
          !(await one(
            db,
            "SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2",
            [org, entry.userId],
          ))
        )
          throw fail(400, "ACL user must belong to organization");
      await db.query(
        "DELETE FROM device_acl WHERE org_id=$1 AND device_id=$2",
        [org, id],
      );
      for (const entry of b.entries)
        await db.query(
          "INSERT INTO device_acl VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [org, id, entry.userId, entry.permission],
        );
      await db.query(
        "UPDATE devices SET acl_enforced=$1 WHERE org_id=$2 AND id=$3",
        [b.enforced, org, id],
      );
      const ended = await db.query(
        "UPDATE remote_sessions SET state='ended',ended_at=now() WHERE org_id=$1 AND device_id=$2 AND state<>'ended' RETURNING id",
        [org, id],
      );
      ended.rows.forEach((row) => closeSession(row.id));
      await audit(db, org, u.id, "device.acl_changed", id);
      return { ok: true };
    });
  });
  app.get("/api/devices/:id/acl", async (req) => {
    const { org } = await scope(req, "devices");
    const id = uuid.parse((req.params as any).id);
    return o.run(org, async (db) => {
      const d = await one(
        db,
        "SELECT acl_enforced FROM devices WHERE org_id=$1 AND id=$2",
        [org, id],
      );
      if (!d) throw fail(404, "Device not found");
      return {
        enforced: d.acl_enforced,
        entries: (
          await db.query(
            "SELECT user_id,permission FROM device_acl WHERE org_id=$1 AND device_id=$2",
            [org, id],
          )
        ).rows,
      };
    });
  });
  app.get("/api/organizations", async (req) => {
    const u = await user(req);
    /* RLS: enumerate organizations through per-org membership transactions. */ const all =
      (await o.db.query("SELECT id,name FROM organizations ORDER BY name"))
        .rows;
    const result = [];
    for (const org of all) {
      const m = await o.run(org.id, (db) =>
        one(db, "SELECT role FROM memberships WHERE org_id=$1 AND user_id=$2", [
          org.id,
          u.id,
        ]),
      );
      if (m) result.push({ ...org, role: m.role });
    }
    return result;
  });
  app.post("/api/organizations", async (req) => {
    const u = await user(req);
    const b = z.object({ name: z.string().min(1).max(120) }).parse(req.body);
    const id = randomUUID();
    await o.db.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
      id,
      b.name,
    ]);
    await o.run(id, async (db) => {
      await db.query("INSERT INTO memberships VALUES($1,$2,'owner')", [
        id,
        u.id,
      ]);
      await audit(db, id, u.id, "organization.created", id);
    });
    return { id, name: b.name };
  });
  app.patch("/api/organization", async (req) => {
    const { org, u } = await scope(req, "settings");
    const b = z.object({ name: z.string().min(1).max(120) }).parse(req.body);
    return o.run(org, async (db) => {
      await db.query("UPDATE organizations SET name=$1 WHERE id=$2", [
        b.name,
        org,
      ]);
      await audit(db, org, u.id, "organization.updated", org);
      return { ok: true };
    });
  });
  app.get("/api/platform/users", async (req) => {
    const u = await user(req);
    if (!u.platform_admin) throw fail(403, "Platform administrator required");
    return (
      await o.db.query(
        "SELECT id,email,platform_admin,created_at FROM users ORDER BY created_at DESC LIMIT 200",
      )
    ).rows;
  });
  app.post("/api/platform/users", async (req) => {
    const u = await user(req);
    if (!u.platform_admin) throw fail(403, "Platform administrator required");
    const b = z
      .object({ email: z.email(), password: z.string().min(12).max(256) })
      .parse(req.body);
    const id = randomUUID();
    await o.db.query(
      "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",
      [
        id,
        b.email.toLowerCase(),
        await argon2.hash(b.password, { type: argon2.argon2id }),
      ],
    );
    return { id, email: b.email };
  });
  app.get("/api/platform/settings", async (req) => {
    const u = await user(req);
    if (!u.platform_admin) throw fail(403, "Platform administrator required");
    return {
      protocol: 2,
      sessionMinutes: 5,
      frameTransport: "JPEG over WebSocket relay",
      passwordResetDelivery: !!o.deliverReset,
      serviceMode: false,
      fileTransfer: true,
      fileTransferMaxBytes: 10485760,
      classroomManagement: true,
      secureExamIsolation: false,
      clipboard: false,
    };
  });
  app.get("/api/devices/:id", async (req) => {
    const { org } = await scope(req, "view");
    const id = uuid.parse((req.params as any).id);
    const d = await o.run(org, (db) =>
      one(
        db,
        "SELECT id,name,group_id,os,agent_version,last_seen,revoked_at,capabilities FROM devices WHERE org_id=$1 AND id=$2",
        [org, id],
      ),
    );
    if (!d) throw fail(404, "Device not found");
    return {
      ...d,
      online: agents.has(id),
      desktopStatus: !agents.has(id)
        ? "offline"
        : interactive.get(id) === true
          ? "available"
          : "unavailable",
    };
  });
  app.patch("/api/devices/:id", async (req) => {
    const { org, u } = await scope(req, "device-manage");
    const id = uuid.parse((req.params as any).id);
    const b = z
      .object({ name: z.string().min(1).max(120), groupId: uuid.nullable() })
      .parse(req.body);
    return o.run(org, async (db) => {
      if (
        !(await one(db, "SELECT id FROM devices WHERE org_id=$1 AND id=$2", [
          org,
          id,
        ]))
      )
        throw fail(404, "Device not found");
      if (!(await deviceAllowed(db, org, id, u.id, "devices")))
        throw fail(403, "Device management ACL denied");
      if (
        b.groupId &&
        !(await one(
          db,
          "SELECT id FROM device_groups WHERE org_id=$1 AND id=$2",
          [org, b.groupId],
        ))
      )
        throw fail(404, "Group not found");
      const d = await one(
        db,
        "UPDATE devices SET name=$1,group_id=$2 WHERE org_id=$3 AND id=$4 RETURNING id",
        [b.name, b.groupId, org, id],
      );
      if (!d) throw fail(404, "Device not found");
      await audit(db, org, u.id, "device.updated", id);
      return { ok: true };
    });
  });
  app.get("/api/devices", async (req) => {
    const { org } = await scope(req, "view");
    return o.run(org, async (db) =>
      (
        await db.query(
          "SELECT id,name,os,agent_version,last_seen,revoked_at,group_id,capabilities FROM devices WHERE org_id=$1 ORDER BY name",
          [org],
        )
      ).rows.map((d) => ({
        ...d,
        online: agents.has(d.id),
        desktopStatus: !agents.has(d.id)
          ? "offline"
          : interactive.get(d.id) === true
            ? "available"
            : "unavailable",
      })),
    );
  });
  app.get("/api/groups", async (req) => {
    const { org } = await scope(req, "view");
    return o.run(
      org,
      async (db) =>
        (
          await db.query(
            "SELECT * FROM device_groups WHERE org_id=$1 ORDER BY name",
            [org],
          )
        ).rows,
    );
  });
  app.post("/api/groups", async (req) => {
    const { org, u } = await scope(req, "devices");
    const b = z.object({ name: z.string().min(1).max(80) }).parse(req.body);
    return o.run(org, async (db) => {
      const id = randomUUID();
      await db.query("INSERT INTO device_groups VALUES($1,$2,$3)", [
        id,
        org,
        b.name,
      ]);
      await audit(db, org, u.id, "group.created", id);
      return { id, ...b };
    });
  });
  app.get("/api/members", async (req) => {
    const { org } = await scope(req, "users");
    return o.run(
      org,
      async (db) =>
        (
          await db.query(
            "SELECT u.id,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1",
            [org],
          )
        ).rows,
    );
  });
  app.post("/api/members", async (req) => {
    const { org, u, role } = await scope(req, "users");
    const b = z
      .object({
        email: z.email(),
        role: z.enum(["admin", "technician", "employee", "viewer"]),
      })
      .parse(req.body);
    if (role !== "owner" && b.role === "admin")
      throw fail(403, "Only owner can appoint admin");
    const target = await one(o.db, "SELECT id FROM users WHERE email=$1", [
      b.email.toLowerCase(),
    ]);
    if (!target) throw fail(404, "User must be provisioned first");
    return o.run(org, async (db) => {
      await db.query("INSERT INTO memberships VALUES($1,$2,$3)", [
        org,
        target.id,
        b.role,
      ]);
      await audit(db, org, u.id, "member.added", target.id);
      return { ok: true };
    });
  });
  app.patch("/api/members/:id", async (req) => {
    const { org, u, role } = await scope(req, "users");
    const id = uuid.parse((req.params as any).id);
    const b = z
      .object({ role: z.enum(["admin", "technician", "employee", "viewer"]) })
      .parse(req.body);
    return o.run(org, async (db) => {
      const old = await one(
        db,
        "SELECT role FROM memberships WHERE org_id=$1 AND user_id=$2 FOR UPDATE",
        [org, id],
      );
      if (!old) throw fail(404, "Member not found");
      if (
        old.role === "owner" ||
        (role !== "owner" && (old.role === "admin" || b.role === "admin"))
      )
        throw fail(403, "Protected role");
      await db.query(
        "UPDATE memberships SET role=$1 WHERE org_id=$2 AND user_id=$3",
        [b.role, org, id],
      );
      const ended = await db.query(
        "UPDATE remote_sessions SET state='ended',ended_at=now() WHERE org_id=$1 AND user_id=$2 AND state<>'ended' RETURNING id",
        [org, id],
      );
      ended.rows.forEach((s) => closeSession(s.id));
      await audit(db, org, u.id, "member.role_changed", id);
      return { ok: true };
    });
  });
  app.get("/api/roles", async (req) => {
    await scope(req);
    return (
      await o.db.query(
        "SELECT role,permission FROM role_permissions ORDER BY role,permission",
      )
    ).rows;
  });
  app.post("/api/enrollments", async (req) => {
    const { org, u } = await scope(req, "devices");
    const t = token();
    const id = randomUUID();
    await o.run(org, async (db) => {
      await db.query(
        "INSERT INTO device_enrollments(id,org_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,now()+interval '10 minutes',$4)",
        [id, org, digest(t), u.id],
      );
      await audit(db, org, u.id, "enrollment.created", id);
    });
    return { id, organizationId: org, token: t, expiresIn: 600 };
  });
  app.post(
    "/api/agent/enroll",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const b = z
        .object({
          organizationId: uuid,
          token: z.string().min(32),
          name: z.string().min(1).max(120),
          publicKey: z.string().max(4096),
          os: z.string().max(120),
          version: z.string().max(40),
        })
        .parse(req.body);
      try {
        const k = createPublicKey(b.publicKey);
        if (
          k.asymmetricKeyType !== "rsa" ||
          (k.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
        )
          throw 0;
      } catch {
        throw fail(400, "RSA key >=3072 bits required");
      }
      return o.run(b.organizationId, async (db) => {
        const e = await one(
          db,
          "UPDATE device_enrollments SET used_at=now() WHERE org_id=$1 AND token_hash=$2 AND used_at IS NULL AND expires_at>now() RETURNING id,created_by",
          [b.organizationId, digest(b.token)],
        );
        if (!e) throw fail(403, "Invalid enrollment");
        const id = randomUUID();
        await db.query(
          "INSERT INTO devices(id,org_id,name,public_key,os,agent_version,capabilities,acl_enforced) VALUES($1,$2,$3,$4,$5,$6,$7,true)",
          [
            id,
            b.organizationId,
            b.name,
            b.publicKey,
            b.os,
            b.version,
            JSON.stringify(["jpeg", "input-v1"]),
          ],
        );
        await audit(db, b.organizationId, e.created_by, "device.enrolled", id);
        return { id, serverPublicKey: o.publicKey };
      });
    },
  );
  app.delete("/api/devices/:id", async (req) => {
    const { org, u } = await scope(req, "device-manage");
    const id = uuid.parse((req.params as any).id);
    return o.run(org, async (db) => {
      if (
        !(await one(db, "SELECT id FROM devices WHERE org_id=$1 AND id=$2", [
          org,
          id,
        ]))
      )
        throw fail(404, "Device not found");
      if (!(await deviceAllowed(db, org, id, u.id, "devices")))
        throw fail(403, "Device management ACL denied");
      const d = await one(
        db,
        "UPDATE devices SET revoked_at=now() WHERE org_id=$1 AND id=$2 RETURNING id",
        [org, id],
      );
      if (!d) throw fail(404, "Device not found");
      const ended = await db.query(
        "UPDATE remote_sessions SET state='ended',ended_at=now() WHERE org_id=$1 AND device_id=$2 AND state<>'ended' RETURNING id",
        [org, id],
      );
      ended.rows.forEach((s) => closeSession(s.id));
      agents.get(id)?.close(1008, "Trust revoked");
      agents.delete(id);
      interactive.delete(id);
      await audit(db, org, u.id, "device.revoked", id);
      return { ok: true };
    });
  });
  app.post("/api/agent/challenge", async (req) => {
    const b = z
      .object({ deviceId: uuid, organizationId: uuid })
      .parse(req.body);
    if (challenges.size > 10000) throw fail(429, "Try later");
    const n = token();
    challenges.set(n, {
      device: b.deviceId,
      org: b.organizationId,
      expires: Date.now() + 30000,
    });
    return { nonce: n };
  });
  app.post("/api/agent/prove", async (req) => {
    const b = z
      .object({
        deviceId: uuid,
        organizationId: uuid,
        nonce: z.string(),
        signature: z.string().max(2048),
      })
      .parse(req.body);
    const n = challenges.get(b.nonce);
    challenges.delete(b.nonce);
    if (
      !n ||
      n.device !== b.deviceId ||
      n.org !== b.organizationId ||
      n.expires < Date.now()
    ) {
      throw fail(403, "Invalid challenge");
    }
    const d = await o.run(b.organizationId, (db) =>
      one(
        db,
        "SELECT public_key FROM devices WHERE org_id=$1 AND id=$2 AND revoked_at IS NULL",
        [b.organizationId, b.deviceId],
      ),
    );
    if (!d || !verifyProof(d.public_key, b.nonce, b.signature))
      throw fail(403, "Invalid proof");
    const t = token();
    tickets.set(digest(t), {
      side: "agent",
      id: b.organizationId + ":" + b.deviceId,
      expires: Date.now() + 15000,
    });
    return { ticket: t };
  });
  app.post("/api/sessions", async (req) => {
    const b = z
      .object({ deviceId: uuid, mode: z.enum(["view", "control"]) })
      .parse(req.body);
    const { org, u } = await scope(req, b.mode);
    return o.run(org, async (db) => {
      const d = await one(
        db,
        "SELECT id FROM devices WHERE org_id=$1 AND id=$2 AND revoked_at IS NULL FOR UPDATE",
        [org, b.deviceId],
      );
      if (!d) throw fail(404, "Device not found");
      if (!(await deviceAllowed(db, org, d.id, u.id, b.mode)))
        throw fail(403, "Device ACL denied");
      if (!agents.has(d.id)) throw fail(409, "Device is offline");
      if (interactive.get(d.id) === false)
        throw fail(409, "No interactive desktop available");
      if (
        await one(
          db,
          "SELECT id FROM remote_sessions WHERE org_id=$1 AND device_id=$2 AND state<>'ended' AND expires_at>now()",
          [org, d.id],
        )
      )
        throw fail(409, "Device already in session");
      const id = randomUUID();
      const expires = Math.min(
        Date.now() + 5 * 60 * 1000,
        new Date(u.auth_expires_at).getTime(),
      );
      await db.query(
        "INSERT INTO remote_sessions(id,org_id,device_id,user_id,mode,state,expires_at,auth_session_hash) VALUES($1,$2,$3,$4,$5,'authorized',$6,$7)",
        [
          id,
          org,
          d.id,
          u.id,
          b.mode,
          new Date(expires),
          digest(req.cookies.nr_session!),
        ],
      );
      await db.query("INSERT INTO session_permissions VALUES($1,$2,$3)", [
        org,
        id,
        b.mode,
      ]);
      await audit(db, org, u.id, "session.authorized", id);
      return { id, expiresAt: expires };
    });
  });
  app.get("/api/sessions", async (req) => {
    const { org } = await scope(req, "view");
    return o.run(
      org,
      async (db) =>
        (
          await db.query(
            "SELECT id,device_id,user_id,mode,state,created_at,expires_at,ended_at FROM remote_sessions WHERE org_id=$1 ORDER BY created_at DESC LIMIT 200",
            [org],
          )
        ).rows,
    );
  });
  app.delete("/api/sessions/:id", async (req) => {
    const { org, u, role } = await scope(req);
    const id = uuid.parse((req.params as any).id);
    return o.run(org, async (db) => {
      const own = await one(
        db,
        "SELECT user_id,device_id FROM remote_sessions WHERE org_id=$1 AND id=$2",
        [org, id],
      );
      if (!own) throw fail(404, "Session not found");
      if (
        own.user_id !== u.id &&
        (!allowed(role, "terminate") ||
          !(await deviceAllowed(db, org, own.device_id, u.id, "terminate")))
      )
        throw fail(403, "Permission denied");
      const s = await one(
        db,
        "UPDATE remote_sessions SET state='ended',ended_at=now() WHERE org_id=$1 AND id=$2 RETURNING id",
        [org, id],
      );
      if (!s) throw fail(404, "Session not found");
      closeSession(id);
      await audit(db, org, u.id, "session.ended", id);
      return { ok: true };
    });
  });
  app.post("/api/sessions/:id/ticket", async (req) => {
    const { org, u } = await scope(req, "view");
    const id = uuid.parse((req.params as any).id);
    const s = await o.run(org, (db) =>
      one(
        db,
        "SELECT * FROM remote_sessions WHERE org_id=$1 AND id=$2 AND user_id=$3 AND state<>'ended' AND expires_at>now()",
        [org, id, u.id],
      ),
    );
    if (!s) throw fail(403, "Session unavailable");
    const t = token();
    tickets.set(digest(t), {
      side: "viewer",
      id: org + ":" + id,
      expires: Date.now() + 15000,
      authHash: digest(req.cookies.nr_session!),
    });
    return { ticket: t };
  });
  app.get("/api/audit", async (req) => {
    const { org } = await scope(req, "audit");
    return o.run(
      org,
      async (db) =>
        (
          await db.query(
            "SELECT * FROM audit_logs WHERE org_id=$1 ORDER BY id DESC LIMIT 200",
            [org],
          )
        ).rows,
    );
  });
  app.get("/api/plans", async (req) => {
    await user(req);
    return (await o.db.query("SELECT * FROM plans")).rows;
  });
  app.get("/api/subscription", async (req) => {
    const { org } = await scope(req);
    return o
      .run(org, (db) =>
        one(db, "SELECT * FROM subscriptions WHERE org_id=$1", [org]),
      )
      .then((x) => x ?? null);
  });
  app.get("/api/agent-versions", async (req) => {
    await user(req);
    return (await o.db.query("SELECT * FROM agent_versions")).rows;
  });
  async function validSession(org: string, id: string) {
    return o.run(org, async (db) =>
      one(
        db,
        "SELECT s.* FROM remote_sessions s JOIN devices d ON d.id=s.device_id AND d.org_id=s.org_id JOIN auth_sessions login ON login.id_hash=s.auth_session_hash AND login.expires_at>now() JOIN memberships m ON m.org_id=s.org_id AND m.user_id=s.user_id WHERE s.org_id=$1 AND s.id=$2 AND s.state<>'ended' AND s.expires_at>now() AND d.revoked_at IS NULL AND (NOT d.acl_enforced OR m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM device_acl acl WHERE acl.org_id=s.org_id AND acl.device_id=s.device_id AND acl.user_id=s.user_id AND acl.permission=s.mode)) AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role=m.role AND rp.permission=s.mode)",
        [org, id],
      ),
    );
  }
  app.get("/api/socket", { websocket: true }, (ws, req) => {
    void (async () => {
      if (req.headers.origin && req.headers.origin !== o.origin) {
        ws.close(1008);
        return;
      }
      // Tickets never belong in URLs/access logs. Agent uses Authorization; browser uses a subprotocol.
      if ((req.query as any)?.ticket) {
        ws.close(1008, "URL credentials rejected");
        return;
      }
      const protocols = String(req.headers["sec-websocket-protocol"] ?? "")
        .split(",")
        .map((s) => s.trim());
      const raw = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : protocols.find((p) => p.startsWith("ticket."))?.slice(7);
      const ticket = raw ? tickets.get(digest(raw)) : undefined;
      if (raw) tickets.delete(digest(raw));
      if (!ticket || ticket.expires < Date.now()) {
        ws.close(1008);
        return;
      }
      if (
        ticket.side === "viewer" &&
        (req.headers.origin !== o.origin ||
          !req.cookies.nr_session ||
          digest(req.cookies.nr_session) !== ticket.authHash)
      ) {
        ws.close(1008);
        return;
      }
      const [org, id] = ticket.id.split(":");
      if (ticket.side === "agent") {
        const d = await o.run(org, (db) =>
          one(
            db,
            "SELECT id FROM devices WHERE org_id=$1 AND id=$2 AND revoked_at IS NULL",
            [org, id],
          ),
        );
        if (!d) {
          ws.close(1008);
          return;
        }
        {
          // Also invalidate persisted grants after a backend process restart.
          const ended = await o.run(org, (db) =>
            db.query(
              "UPDATE remote_sessions SET state='ended',ended_at=now() WHERE org_id=$1 AND device_id=$2 AND state<>'ended' RETURNING id",
              [org, id],
            ),
          );
          ended.rows.forEach((row) => closeSession(row.id));
          agents.get(id)?.terminate();
        }
        agents.set(id, ws);
        interactive.set(id, false);
        await o.run(org, (db) =>
          db.query(
            "UPDATE devices SET last_seen=now() WHERE org_id=$1 AND id=$2",
            [org, id],
          ),
        );
        let lastPing = Date.now();
        const watchdog = setInterval(() => {
          if (Date.now() - lastPing > 30000)
            ws.close(1001, "Heartbeat timeout");
        }, 10000);
        watchdog.unref();
        let busy = false;
        ws.on("message", (data, isBinary) => {
          if (agents.get(id) !== ws || ws.readyState !== 1) return;
          if (!isBinary) {
            if (data.toString() === "ping") {
              lastPing = Date.now();
              ws.send("pong");
              void o
                .run(org, (db) =>
                  db.query(
                    "UPDATE devices SET last_seen=now() WHERE org_id=$1 AND id=$2 AND revoked_at IS NULL",
                    [org, id],
                  ),
                )
                .catch(() => ws.close(1011));
            } else {
              try {
                const state = JSON.parse(data.toString());
                if (
                  state.type === "health" &&
                  typeof state.interactive === "boolean"
                ) {
                  const wasInteractive = interactive.get(id);
                  interactive.set(id, state.interactive);
                  if (wasInteractive === true && state.interactive === false) {
                    for (const sid of sessionDevices.keys())
                      if (sessionDevices.get(sid) === id) closeSession(sid);
                    void o
                      .run(org, async (db) => {
                        const rows = await db.query(
                          "UPDATE remote_sessions SET state='ended',ended_at=now() WHERE org_id=$1 AND device_id=$2 AND state<>'ended' RETURNING id",
                          [org, id],
                        );
                        for (const row of rows.rows)
                          await audit(
                            db,
                            org,
                            null,
                            "session.desktop_unavailable",
                            row.id,
                          );
                      })
                      .catch(() => ws.close(1011));
                  }
                  ws.send(JSON.stringify({ type: "healthAck" }));
                }
                if (state.type === "health")
                  for (const sid of sessionDevices.keys())
                    if (sessionDevices.get(sid) === id)
                      viewers.get(sid)?.send(JSON.stringify(state));
              } catch {
                ws.close(1008);
              }
            }
            return;
          }
          if (busy) return;
          busy = true;
          void (async () => {
            const bytes = Buffer.from(data as Buffer);
            if (bytes.length < 38 || bytes.length > MAX_FRAME_BYTES) return;
            const sid = bytes.subarray(0, 36).toString();
            if (!uuid.safeParse(sid).success) return;
            const s = await validSession(org, sid);
            if (
              !s ||
              s.device_id !== id ||
              agents.get(id) !== ws ||
              ws.readyState !== 1
            )
              return;
            const viewer = viewers.get(sid);
            if (
              viewer?.readyState === 1 &&
              streamGates
                .get(sid)
                ?.allow(viewer.bufferedAmount, bytes.length, Date.now())
            )
              viewer.send(bytes.subarray(36), { binary: true });
            else if (viewer?.readyState === 1) {
              ws.send(
                JSON.stringify({
                  type: "flow",
                  sessionId: sid,
                  congested: true,
                }),
              );
              if (streamGates.get(sid)?.stalled(Date.now())) closeSession(sid);
            }
          })()
            .catch(() => ws.close(1011))
            .finally(() => {
              busy = false;
            });
        });
        ws.on("close", () => {
          clearInterval(watchdog);
          if (agents.get(id) === ws) {
            agents.delete(id);
            interactive.delete(id);
            void o
              .run(org, async (db) => {
                const rows = await db.query(
                  "UPDATE remote_sessions SET state='ended',ended_at=now() WHERE org_id=$1 AND device_id=$2 AND state<>'ended' RETURNING id",
                  [org, id],
                );
                rows.rows.forEach((s) => closeSession(s.id));
              })
              .catch(() => app.log.error("Disconnect cleanup failed"));
          }
        });
      } else {
        const s = await validSession(org, id);
        if (!s || !agents.has(s.device_id)) {
          ws.close(1008);
          return;
        }
        viewers.get(id)?.close(1000, "Replaced");
        viewers.set(id, ws);
        const gate = new StreamGate();
        streamGates.set(id, gate);
        sessionDevices.set(id, s.device_id);
        await o.run(org, (db) =>
          db.query(
            "UPDATE remote_sessions SET state='active' WHERE org_id=$1 AND id=$2",
            [org, id],
          ),
        );
        const grant = signGrant(
          {
            sessionId: id,
            deviceId: s.device_id,
            organizationId: org,
            mode: s.mode,
            expiresAt: new Date(s.expires_at).getTime(),
            protocol: 2,
          },
          o.signingKey,
        );
        agents.get(s.device_id)!.send(JSON.stringify({ type: "grant", grant }));
        let seq = 0,
          pending = 0;
        let queue = Promise.resolve();
        ws.on("message", (data, binary) => {
          if (binary || data.toString().length > 4096 || pending >= 128) {
            ws.close(1008, "Invalid input or queue overflow");
            return;
          }
          pending++;
          queue = queue
            .then(async () => {
              if (ws.readyState !== 1 || viewers.get(id) !== ws) return;
              const message = JSON.parse(data.toString());
              if (
                message.type === "ping" &&
                typeof message.sentAt === "number"
              ) {
                ws.send(
                  JSON.stringify({ type: "pong", sentAt: message.sentAt }),
                );
                return;
              }
              if (message.type === "stream" && message.acks === true) {
                gate.acknowledged = true;
                return;
              }
              if (message.type === "frameAck") {
                const elapsed = gate.ack(Date.now());
                if (elapsed !== null)
                  agents.get(s.device_id)?.send(
                    JSON.stringify({
                      type: "flow",
                      sessionId: id,
                      congested: elapsed > 250,
                    }),
                  );
                return;
              }
              if (message.type === "quality") {
                const current = await validSession(org, id);
                const q = qualitySchema.safeParse(message.settings);
                if (!current || !q.success) {
                  ws.close(1008);
                  return;
                }
                if (viewers.get(id) === ws)
                  agents.get(s.device_id)?.send(
                    JSON.stringify({
                      type: "quality",
                      sessionId: id,
                      settings: q.data,
                    }),
                  );
                return;
              }
              const e = inputSchema.safeParse(message);
              if (!e.success || e.data.seq <= seq) return;
              const current = await validSession(org, id);
              if (!current || current.mode !== "control") {
                ws.close(1008);
                return;
              }
              if (viewers.get(id) !== ws || ws.readyState !== 1) return;
              seq = e.data.seq;
              agents.get(s.device_id)?.send(
                JSON.stringify({
                  type: "input",
                  sessionId: id,
                  event: e.data,
                }),
              );
            })
            .catch(() => ws.close(1008))
            .finally(() => {
              pending--;
            });
        });
        const expiry = setTimeout(
          () => {
            if (viewers.get(id) !== ws) return;
            closeSession(id);
            void o
              .run(org, (db) =>
                db.query(
                  "UPDATE remote_sessions SET state='ended',ended_at=now() WHERE org_id=$1 AND id=$2",
                  [org, id],
                ),
              )
              .catch(() => app.log.error("Session cleanup failed"));
          },
          Math.max(0, new Date(s.expires_at).getTime() - Date.now()),
        );
        ws.on("close", () => {
          clearTimeout(expiry);
          if (viewers.get(id) === ws) {
            viewers.delete(id);
            streamGates.delete(id);
            sessionDevices.delete(id);
            agents
              .get(s.device_id)
              ?.send(JSON.stringify({ type: "revoke", sessionId: id }));
            void o
              .run(org, (db) =>
                db.query(
                  "UPDATE remote_sessions SET state='ended',ended_at=now() WHERE org_id=$1 AND id=$2",
                  [org, id],
                ),
              )
              .catch(() => app.log.error("Session cleanup failed"));
          }
        });
        ws.send(
          JSON.stringify({
            type: "ready",
            sessionId: id,
            mode: s.mode,
            expiresAt: new Date(s.expires_at).getTime(),
          }),
        );
      }
    })().catch(() => ws.close(1008));
  });
  registerManagement(app, {
    ...o,
    scope,
    deviceAllowed,
    audit,
    online: (id) => agents.has(id),
  });
  return app;
}
