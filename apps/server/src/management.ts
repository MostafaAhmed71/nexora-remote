import type { FastifyInstance } from "fastify";
import type { DB } from "../../../packages/database/index.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { signGrant, token, verifyProof } from "./security.js";

type Run = <T>(org: string, fn: (db: DB) => Promise<T>) => Promise<T>;
type Scope = { org: string; u: Record<string, any>; role: string };
const uuid = z.string().uuid();
const fail = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });
const one = async (db: DB, sql: string, args: unknown[] = []) =>
  (await db.query(sql, args)).rows[0];
const fileName = z
  .string()
  .min(1)
  .max(160)
  .refine(
    (s) =>
      !/[\\/:*?"<>|\x00-\x1f]/.test(s) &&
      !/[. ]$/.test(s) &&
      s !== "." &&
      s !== "..",
    "Invalid filename",
  );
const fileLimit = 10 * 1024 * 1024;
const chunkSize = 24576;
export function registerManagement(
  app: FastifyInstance,
  o: {
    run: Run;
    scope: (req: any, permission?: string) => Promise<Scope>;
    deviceAllowed: (
      db: DB,
      org: string,
      device: string,
      user: string,
      permission: string,
    ) => Promise<boolean>;
    audit: (
      db: DB,
      org: string,
      actor: string | null,
      event: string,
      target?: string,
    ) => Promise<void>;
    signingKey: string;
    online: (id: string) => boolean;
  },
) {
  async function master(req: any) {
    const s = await o.scope(req, "devices");
    if (!["owner", "admin"].includes(s.role))
      throw fail(403, "Master administrator required");
    return s;
  }
  app.get("/api/master/devices", async (req) => {
    const { org } = await o.scope(req, "view");
    return o.run(org, async (db) =>
      (
        await db.query(
          `SELECT d.id,d.name,d.group_id,d.revoked_at,m.room,m.seat_x,m.seat_y,m.notes,m.revision,m.locked,m.ends_at,m.paused_seconds,m.profile_id,m.agent_revision,m.agent_seen,m.agent_error FROM devices d LEFT JOIN device_management m ON m.org_id=d.org_id AND m.device_id=d.id WHERE d.org_id=$1 AND d.revoked_at IS NULL ORDER BY d.name`,
          [org],
        )
      ).rows.map((d) => ({
        ...d,
        online: o.online(d.id),
        effectiveLocked:
          !!d.locked ||
          (!!d.ends_at && new Date(d.ends_at).getTime() <= Date.now()),
        managementReady:
          !!d.agent_seen &&
          Date.now() - new Date(d.agent_seen).getTime() < 20000,
      })),
    );
  });
  app.patch("/api/master/devices/:id/layout", async (req) => {
    const { org, u } = await master(req);
    const id = uuid.parse((req.params as any).id);
    const b = z
      .object({
        room: z.string().trim().max(80),
        x: z.number().int().min(0).max(20),
        y: z.number().int().min(0).max(20),
        notes: z.string().max(1000),
      })
      .parse(req.body);
    return o.run(org, async (db) => {
      if (
        !(await one(
          db,
          "SELECT id FROM devices WHERE org_id=$1 AND id=$2 AND revoked_at IS NULL",
          [org, id],
        ))
      )
        throw fail(404, "Device not found");
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        org,
      ]);
      await db.query(
        "UPDATE device_management SET room='' WHERE org_id=$1 AND device_id IN (SELECT id FROM devices WHERE org_id=$1 AND revoked_at IS NOT NULL)",
        [org],
      );
      if (
        b.room &&
        (await one(
          db,
          "SELECT device_id FROM device_management WHERE org_id=$1 AND room=$2 AND seat_x=$3 AND seat_y=$4 AND device_id<>$5",
          [org, b.room, b.x, b.y, id],
        ))
      )
        throw fail(
          409,
          "هذا المكان مشغول بجهاز آخر؛ اختر صفًا أو عمودًا مختلفًا",
        );
      await db.query(
        "INSERT INTO device_management(org_id,device_id,room,seat_x,seat_y,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(org_id,device_id) DO UPDATE SET room=$3,seat_x=$4,seat_y=$5,notes=$6",
        [org, id, b.room, b.x, b.y, b.notes],
      );
      await o.audit(db, org, u.id, "master.layout", id);
      return { ok: true };
    });
  });
  for (const kind of ["packages", "profiles"] as const) {
    const table = kind === "packages" ? "time_packages" : "classroom_profiles";
    app.get(`/api/master/${kind}`, async (req) => {
      const { org } = await o.scope(req, "view");
      return o.run(
        org,
        async (db) =>
          (
            await db.query(
              `SELECT * FROM ${table} WHERE org_id=$1 ORDER BY name`,
              [org],
            )
          ).rows,
      );
    });
    app.post(`/api/master/${kind}`, async (req) => {
      const { org, u } = await master(req);
      const id = randomUUID();
      const b =
        kind === "packages"
          ? z
              .object({
                name: z.string().trim().min(1).max(80),
                minutes: z.number().int().min(1).max(10080),
              })
              .parse(req.body)
          : z
              .object({
                name: z.string().trim().min(1).max(80),
                apps: z
                  .array(
                    z
                      .string()
                      .min(1)
                      .max(260)
                      .regex(/^[A-Za-z]:\\.*\.exe$/i),
                  )
                  .max(20),
                sites: z
                  .array(
                    z
                      .url()
                      .refine(
                        (s) =>
                          new URL(s).protocol === "https:" &&
                          !new URL(s).username &&
                          !new URL(s).password,
                      ),
                  )
                  .max(20),
              })
              .parse(req.body);
      return o.run(org, async (db) => {
        if ("minutes" in b)
          await db.query("INSERT INTO time_packages VALUES($1,$2,$3,$4)", [
            id,
            org,
            b.name,
            b.minutes,
          ]);
        else
          await db.query(
            "INSERT INTO classroom_profiles VALUES($1,$2,$3,$4,$5)",
            [id, org, b.name, JSON.stringify(b.apps), JSON.stringify(b.sites)],
          );
        await o.audit(db, org, u.id, `master.${kind}.created`, id);
        return { id, ...b };
      });
    });
    app.delete(`/api/master/${kind}/:id`, async (req) => {
      const { org, u } = await master(req);
      const id = uuid.parse((req.params as any).id);
      return o.run(org, async (db) => {
        if (
          kind === "profiles" &&
          (await one(
            db,
            "SELECT device_id FROM device_management WHERE org_id=$1 AND profile_id=$2 LIMIT 1",
            [org, id],
          ))
        )
          throw fail(409, "Remove profile from devices first");
        await db.query(`DELETE FROM ${table} WHERE org_id=$1 AND id=$2`, [
          org,
          id,
        ]);
        await o.audit(db, org, u.id, `master.${kind}.deleted`, id);
        return { ok: true };
      });
    });
  }
  app.post("/api/master/batch", async (req) => {
    const { org, u } = await master(req);
    const b = z
      .object({
        deviceIds: z
          .array(uuid)
          .min(1)
          .max(100)
          .refine((a) => new Set(a).size === a.length),
        action: z.enum([
          "start",
          "extend",
          "pause",
          "resume",
          "lock",
          "unlock",
          "profile",
          "group",
        ]),
        minutes: z.number().int().min(1).max(10080).optional(),
        packageId: uuid.optional(),
        profileId: uuid.nullable().optional(),
        groupId: uuid.nullable().optional(),
      })
      .parse(req.body);
    return o.run(org, async (db) => {
      let minutes = b.minutes;
      if (b.packageId) {
        const p = await one(
          db,
          "SELECT minutes FROM time_packages WHERE org_id=$1 AND id=$2",
          [org, b.packageId],
        );
        if (!p) throw fail(404, "Package not found");
        minutes = p.minutes;
      }
      if (["start", "extend"].includes(b.action) && !minutes)
        throw fail(400, "Choose minutes or a package");
      if (
        b.action === "profile" &&
        (b.profileId === undefined ||
          (b.profileId &&
            !(await one(
              db,
              "SELECT id FROM classroom_profiles WHERE org_id=$1 AND id=$2",
              [org, b.profileId],
            ))))
      )
        throw fail(400, "Choose an existing profile");
      if (
        b.action === "group" &&
        (b.groupId === undefined ||
          (b.groupId &&
            !(await one(
              db,
              "SELECT id FROM device_groups WHERE org_id=$1 AND id=$2",
              [org, b.groupId],
            ))))
      )
        throw fail(400, "Choose an existing group");
      // Validate the whole set before changing anything; sorted row locks serialize concurrent masters.
      for (const id of [...b.deviceIds].sort()) {
        if (
          !(await one(
            db,
            "SELECT id FROM devices WHERE org_id=$1 AND id=$2 AND revoked_at IS NULL FOR UPDATE",
            [org, id],
          ))
        )
          throw fail(404, "Device not found");
        if (!(await o.deviceAllowed(db, org, id, u.id, "devices")))
          throw fail(403, "Device ACL denied");
        await db.query(
          "INSERT INTO device_management(org_id,device_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [org, id],
        );
      }
      for (const id of b.deviceIds) {
        const m = await one(
          db,
          "SELECT * FROM device_management WHERE org_id=$1 AND device_id=$2 FOR UPDATE",
          [org, id],
        );
        let ends = m.ends_at,
          paused = m.paused_seconds,
          locked = m.locked;
        const now = Date.now();
        if (b.action === "start") {
          ends = new Date(now + minutes! * 60000);
          paused = null;
          locked = false;
        }
        if (b.action === "extend") {
          if (paused !== null)
            paused = Math.min(604800, paused + minutes! * 60);
          else
            ends = new Date(
              Math.min(
                now + 604800000,
                Math.max(now, ends ? new Date(ends).getTime() : now) +
                  minutes! * 60000,
              ),
            );
        }
        if (b.action === "pause") {
          if (!ends || new Date(ends).getTime() <= now)
            throw fail(409, "No active timer to pause");
          paused = Math.ceil((new Date(ends).getTime() - now) / 1000);
          ends = null;
          locked = true;
        }
        if (b.action === "resume") {
          if (!paused) throw fail(409, "No paused timer to resume");
          ends = new Date(now + paused * 1000);
          paused = null;
          locked = false;
        }
        if (b.action === "lock") locked = true;
        if (b.action === "unlock") {
          locked = false;
          ends = null;
          paused = null;
        }
        await db.query(
          "UPDATE device_management SET revision=revision+1,locked=$3,ends_at=$4,paused_seconds=$5,profile_id=$6 WHERE org_id=$1 AND device_id=$2",
          [
            org,
            id,
            locked,
            ends,
            paused,
            b.action === "profile" ? b.profileId : m.profile_id,
          ],
        );
        if (b.action === "group")
          await db.query(
            "UPDATE devices SET group_id=$3 WHERE org_id=$1 AND id=$2",
            [org, id, b.groupId],
          );
        await o.audit(db, org, u.id, `master.${b.action}`, id);
      }
      return { ok: true, count: b.deviceIds.length };
    });
  });
  async function fileScope(req: any) {
    const s = await o.scope(req, "device-manage");
    const id = uuid.parse((req.params as any).id);
    await o.run(s.org, async (db) => {
      if (
        !(await one(
          db,
          "SELECT id FROM devices WHERE org_id=$1 AND id=$2 AND revoked_at IS NULL",
          [s.org, id],
        ))
      )
        throw fail(404, "Device not found");
      if (!(await o.deviceAllowed(db, s.org, id, s.u.id, "files")))
        throw fail(403, "Device ACL denied");
    });
    return { ...s, id };
  }
  app.get("/api/master/devices/:id/files", async (req) => {
    const { org, id } = await fileScope(req);
    return o.run(
      org,
      async (db) =>
        (
          await db.query(
            "SELECT id,name,size,direction,status,transferred,created_at FROM managed_files WHERE org_id=$1 AND device_id=$2 AND expires_at>now() ORDER BY created_at DESC LIMIT 100",
            [org, id],
          )
        ).rows,
    );
  });
  app.post(
    "/api/master/devices/:id/files",
    { bodyLimit: 15 * 1024 * 1024 },
    async (req) => {
      const { org, id, u } = await fileScope(req);
      const b = z
        .object({
          name: fileName,
          data: z
            .string()
            .max(13981016)
            .regex(
              /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
            ),
        })
        .parse(req.body);
      const data = Buffer.from(b.data, "base64");
      if (data.length > fileLimit)
        throw fail(413, "Maximum file size is 10 MiB");
      return o.run(org, async (db) => {
        await db.query(
          "SELECT id FROM devices WHERE org_id=$1 AND id=$2 FOR UPDATE",
          [org, id],
        );
        await db.query(
          "DELETE FROM managed_files WHERE org_id=$1 AND expires_at<=now()",
          [org],
        );
        const used = await one(
          db,
          "SELECT coalesce(sum(size),0) AS size,count(*) AS count FROM managed_files WHERE org_id=$1 AND device_id=$2 AND status NOT IN ('cancelled','rejected')",
          [org, id],
        );
        if (
          Number(used.size) + data.length > 50 * 1024 * 1024 ||
          Number(used.count) >= 100
        )
          throw fail(
            409,
            "Device transfer quota reached; cancel old transfers",
          );
        const fid = randomUUID();
        await db.query(
          "INSERT INTO managed_files(id,org_id,device_id,created_by,direction,name,size,data) VALUES($1,$2,$3,$4,'to_device',$5,$6,$7)",
          [fid, org, id, u.id, b.name, data.length, data],
        );
        await o.audit(db, org, u.id, "file.queued", fid);
        return { id: fid };
      });
    },
  );
  app.get("/api/master/devices/:id/files/:file", async (req, reply) => {
    const { org, id, u } = await fileScope(req);
    const fid = uuid.parse((req.params as any).file);
    return o.run(org, async (db) => {
      const f = await one(
        db,
        "SELECT * FROM managed_files WHERE org_id=$1 AND device_id=$2 AND id=$3 AND direction='from_device' AND status='complete' AND expires_at>now()",
        [org, id, fid],
      );
      if (!f) throw fail(404, "File not available");
      await o.audit(db, org, u.id, "file.downloaded", fid);
      reply
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        )
        .type("application/octet-stream");
      return Buffer.from(f.data);
    });
  });
  app.delete("/api/master/devices/:id/files/:file", async (req) => {
    const { org, id, u } = await fileScope(req);
    const fid = uuid.parse((req.params as any).file);
    return o.run(org, async (db) => {
      await db.query(
        "UPDATE managed_files SET status='cancelled',data='' WHERE org_id=$1 AND device_id=$2 AND id=$3",
        [org, id, fid],
      );
      await o.audit(db, org, u.id, "file.cancelled", fid);
      return { ok: true };
    });
  });

  const challenges = new Map<
    string,
    { org: string; device: string; expires: number }
  >();
  const clean = setInterval(() => {
    for (const [n, c] of challenges)
      if (c.expires < Date.now()) challenges.delete(n);
  }, 10000);
  clean.unref();
  app.addHook("onClose", async () => clearInterval(clean));
  const agentIdentity = z.object({ organizationId: uuid, deviceId: uuid });
  app.post(
    "/api/agent/management/challenge",
    { config: { rateLimit: { max: 12000, timeWindow: "1 minute" } } },
    async (req) => {
      const b = agentIdentity.parse(req.body);
      const d = await o.run(b.organizationId, (db) =>
        one(
          db,
          "SELECT id FROM devices WHERE org_id=$1 AND id=$2 AND revoked_at IS NULL",
          [b.organizationId, b.deviceId],
        ),
      );
      if (!d) throw fail(403, "Unknown device");
      if (challenges.size >= 10000) throw fail(429, "Too many challenges");
      const nonce = token();
      challenges.set(nonce, {
        org: b.organizationId,
        device: b.deviceId,
        expires: Date.now() + 30000,
      });
      return { nonce };
    },
  );
  app.post(
    "/api/agent/management/sync",
    { config: { rateLimit: { max: 12000, timeWindow: "1 minute" } } },
    async (req) => {
      const b = agentIdentity
        .extend({
          nonce: z.string().max(128),
          payload: z.string().max(50000),
          signature: z.string().max(1024),
        })
        .parse(req.body);
      const c = challenges.get(b.nonce);
      challenges.delete(b.nonce);
      if (
        !c ||
        c.expires < Date.now() ||
        c.org !== b.organizationId ||
        c.device !== b.deviceId
      )
        throw fail(403, "Expired device challenge");
      return o.run(c.org, async (db) => {
        const d = await one(
          db,
          "SELECT public_key FROM devices WHERE org_id=$1 AND id=$2 AND revoked_at IS NULL FOR UPDATE",
          [c.org, c.device],
        );
        if (
          !d ||
          !verifyProof(d.public_key, b.nonce + "\n" + b.payload, b.signature)
        )
          throw fail(403, "Invalid device proof");
        const p = z
          .object({
            revision: z.number().int().min(0).optional(),
            error: z.string().max(200).nullable().optional(),
            fileId: uuid.optional(),
            offset: z.number().int().min(0).max(fileLimit).optional(),
            result: z.enum(["complete", "rejected"]).optional(),
            upload: z
              .object({
                id: uuid.nullish(),
                name: fileName,
                size: z.number().int().min(0).max(fileLimit),
                offset: z.number().int().min(0).max(fileLimit),
                data: z.string().max(32768),
              })
              .optional(),
          })
          .parse(JSON.parse(b.payload));
        await db.query(
          "INSERT INTO device_management(org_id,device_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [c.org, c.device],
        );
        await db.query(
          "UPDATE device_management SET agent_seen=now(),agent_revision=$3,agent_error=$4 WHERE org_id=$1 AND device_id=$2",
          [c.org, c.device, p.revision ?? null, p.error ?? null],
        );
        await db.query(
          "DELETE FROM managed_files WHERE org_id=$1 AND expires_at<=now()",
          [c.org],
        );
        if (p.fileId && p.result) {
          const f = await one(
            db,
            "SELECT id FROM managed_files WHERE org_id=$1 AND device_id=$2 AND id=$3 AND direction='to_device' AND status='pending'",
            [c.org, c.device, p.fileId],
          );
          if (f) {
            await db.query(
              "UPDATE managed_files SET status=$4,transferred=CASE WHEN $4='complete' THEN size ELSE transferred END,data='' WHERE org_id=$1 AND device_id=$2 AND id=$3",
              [c.org, c.device, p.fileId, p.result],
            );
            await o.audit(db, c.org, null, `file.${p.result}`, p.fileId);
          }
        }
        let uploadAck: object | null = null;
        if (p.upload) {
          const f = p.upload,
            bytes = Buffer.from(f.data, "base64");
          if (
            bytes.length > chunkSize ||
            f.offset + bytes.length > f.size ||
            (!bytes.length && f.size > f.offset)
          )
            throw fail(400, "Invalid file chunk");
          const fid = f.id ?? randomUUID();
          let row = await one(
            db,
            "SELECT * FROM managed_files WHERE org_id=$1 AND device_id=$2 AND id=$3 FOR UPDATE",
            [c.org, c.device, fid],
          );
          if (!row) {
            if (f.offset !== 0) throw fail(409, "Upload must start at zero");
            const usage = await one(
              db,
              "SELECT coalesce(sum(size),0) AS size,count(*) AS count FROM managed_files WHERE org_id=$1 AND device_id=$2 AND status NOT IN ('cancelled','rejected')",
              [c.org, c.device],
            );
            if (
              Number(usage.size) + f.size > 50 * 1024 * 1024 ||
              Number(usage.count) >= 100
            )
              throw fail(409, "Transfer quota reached");
            await db.query(
              "INSERT INTO managed_files(id,org_id,device_id,direction,name,size) VALUES($1,$2,$3,'from_device',$4,$5)",
              [fid, c.org, c.device, f.name, f.size],
            );
            await o.audit(db, c.org, null, "file.local_upload", fid);
            row = {
              transferred: 0,
              size: f.size,
              name: f.name,
              direction: "from_device",
              status: "pending",
              data: Buffer.alloc(0),
            };
          }
          if (
            row.direction !== "from_device" ||
            !["pending", "complete"].includes(row.status) ||
            row.size !== f.size ||
            row.name !== f.name
          )
            throw fail(409, "Transfer no longer available");
          if (f.offset < row.transferred || row.status === "complete") {
            if (
              !Buffer.from(row.data)
                .subarray(f.offset, f.offset + bytes.length)
                .equals(bytes)
            )
              throw fail(409, "Conflicting retry");
            uploadAck = { id: fid, offset: row.transferred };
          } else {
            if (row.transferred !== f.offset)
              throw fail(409, "Upload offset mismatch");
            const offset = f.offset + bytes.length;
            await db.query(
              "UPDATE managed_files SET data=data||$4::bytea,transferred=$5,status=$6 WHERE org_id=$1 AND device_id=$2 AND id=$3",
              [
                c.org,
                c.device,
                fid,
                bytes,
                offset,
                offset === f.size ? "complete" : "pending",
              ],
            );
            uploadAck = { id: fid, offset };
          }
        }
        const m = await one(
          db,
          "SELECT m.*,p.name AS profile_name,p.apps,p.sites FROM device_management m LEFT JOIN classroom_profiles p ON p.org_id=m.org_id AND p.id=m.profile_id WHERE m.org_id=$1 AND m.device_id=$2",
          [c.org, c.device],
        );
        let file: object | null = null;
        const f = await one(
          db,
          "SELECT * FROM managed_files WHERE org_id=$1 AND device_id=$2 AND direction='to_device' AND status='pending' ORDER BY created_at LIMIT 1",
          [c.org, c.device],
        );
        if (f) {
          const offset = p.fileId === f.id ? (p.offset ?? 0) : 0;
          if (offset > f.size) throw fail(400, "Invalid offset");
          await db.query(
            "UPDATE managed_files SET transferred=$4 WHERE org_id=$1 AND device_id=$2 AND id=$3",
            [c.org, c.device, f.id, offset],
          );
          file = {
            id: f.id,
            name: f.name,
            size: f.size,
            offset,
            data: Buffer.from(f.data)
              .subarray(offset, offset + chunkSize)
              .toString("base64"),
          };
        }
        const now = Date.now();
        return {
          signed: signGrant(
            {
              kind: "management",
              deviceId: c.device,
              organizationId: c.org,
              nonce: b.nonce,
              issuedAt: now,
              expiresAt: now + 60000,
              revision: m.revision,
              locked: m.locked,
              endsAt: m.ends_at ? new Date(m.ends_at).getTime() : null,
              pausedSeconds: m.paused_seconds,
              profile: m.profile_id
                ? { name: m.profile_name, apps: m.apps, sites: m.sites }
                : null,
              file,
              uploadAck,
            },
            o.signingKey,
          ),
        };
      });
    },
  );
}
