import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import {
  randomUUID,
  generateKeyPairSync,
  createSign,
  createVerify,
} from "node:crypto";
import { createApp } from "../apps/server/src/app.js";
import { digest } from "../apps/server/src/security.js";
import type { DB } from "../packages/database/index.js";

const org = randomUUID(),
  otherOrg = randomUUID(),
  owner = randomUUID(),
  viewer = randomUUID(),
  tech = randomUUID(),
  device = randomUUID(),
  second = randomUUID(),
  retired = randomUUID(),
  foreign = randomUUID();
const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const origin = "http://localhost:5173";
let db: PGlite, app: Awaited<ReturnType<typeof createApp>>;
const adapter = (d: any): DB => ({ query: (sql, args) => d.query(sql, args) });
async function call(
  path: string,
  method: any = "GET",
  payload?: any,
  who = "owner",
  tenant = org,
) {
  return app.inject({
    method,
    url: "/api" + path,
    payload,
    headers: {
      origin,
      cookie: `nr_session=${who}`,
      "x-organization-id": tenant,
    },
  });
}
async function agent(payload: object = {}, id = device) {
  const ch = await call("/agent/management/challenge", "POST", {
    organizationId: org,
    deviceId: id,
  });
  expect(ch.statusCode).toBe(200);
  const nonce = ch.json().nonce,
    text = JSON.stringify(payload),
    signature = createSign("SHA256")
      .update(nonce + "\n" + text)
      .sign(keys.privateKey, "base64");
  const body = {
    organizationId: org,
    deviceId: id,
    nonce,
    payload: text,
    signature,
  };
  const r = await call("/agent/management/sync", "POST", body);
  return {
    r,
    body,
    state: () => {
      expect(r.statusCode).toBe(200);
      const [data, sig] = r.json().signed.split(".");
      expect(
        createVerify("SHA256")
          .update(data)
          .verify(keys.publicKey, sig, "base64url"),
      ).toBe(true);
      return JSON.parse(Buffer.from(data, "base64url").toString());
    },
  };
}
beforeAll(async () => {
  db = new PGlite();
  for (const file of (await readdir("packages/database/migrations"))
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort())
    await db.exec(
      await readFile("packages/database/migrations/" + file, "utf8"),
    );
  await db.query("INSERT INTO organizations(id,name) VALUES($1,'A'),($2,'B')", [
    org,
    otherOrg,
  ]);
  for (const [id, role] of [
    [owner, "owner"],
    [viewer, "viewer"],
    [tech, "technician"],
  ]) {
    await db.query(
      "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'unused')",
      [id, role + "@example.test"],
    );
    await db.query("INSERT INTO memberships VALUES($1,$2,$3)", [org, id, role]);
    await db.query(
      "INSERT INTO auth_sessions(id_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [digest(role), id],
    );
  }
  for (const [id, tenant] of [
    [device, org],
    [second, org],
    [foreign, otherOrg],
    [retired, org],
  ])
    await db.query(
      "INSERT INTO devices(id,org_id,name,public_key,os,agent_version) VALUES($1,$2,$3,$4,'Windows','test')",
      [id, tenant, id, keys.publicKey],
    );
  await db.exec(
    "CREATE ROLE management_app; GRANT USAGE ON SCHEMA public TO management_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO management_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO management_app; SET ROLE management_app",
  );
  app = await createApp({
    db: adapter(db),
    run: (tenant, fn) =>
      db.transaction(async (tx) => {
        await tx.query("SELECT set_config('app.org_id',$1,true)", [tenant]);
        return fn(adapter(tx));
      }),
    origin,
    mfaKey: Buffer.alloc(32, 1),
    signingKey: keys.privateKey,
    publicKey: keys.publicKey,
  });
});
afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe("master management authorization and state", () => {
  it("requires master role, valid origin and tenant scope", async () => {
    const body = { deviceIds: [device], action: "lock" };
    expect(
      (await call("/master/batch", "POST", body, "viewer")).statusCode,
    ).toBe(403);
    expect(
      (await call("/master/batch", "POST", body, "technician")).statusCode,
    ).toBe(403);
    expect(
      (await call("/master/batch", "POST", { ...body, deviceIds: [foreign] }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call("/master/devices", "GET", undefined, "owner", otherOrg))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/master/batch",
          payload: body,
          headers: {
            cookie: "nr_session=owner",
            origin: "https://evil.test",
            "x-organization-id": org,
          },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("starts packages, pauses, extends and resumes, then enforces expiry in state", async () => {
    const pack = await call("/master/packages", "POST", {
      name: "One hour",
      minutes: 60,
    });
    expect(pack.statusCode).toBe(200);
    expect(
      (
        await call("/master/batch", "POST", {
          deviceIds: [device, second],
          action: "start",
          packageId: pack.json().id,
        })
      ).statusCode,
    ).toBe(200);
    const list = (await call("/master/devices")).json();
    expect(list.find((d: any) => d.id === device).ends_at).toBeTruthy();
    expect(
      (
        await call("/master/batch", "POST", {
          deviceIds: [device],
          action: "pause",
        })
      ).statusCode,
    ).toBe(200);
    const before = (await agent()).state();
    expect(before.locked).toBe(true);
    expect(before.endsAt).toBe(null);
    expect(before.pausedSeconds).toBeGreaterThan(3500);
    await call("/master/batch", "POST", {
      deviceIds: [device],
      action: "extend",
      minutes: 10,
    });
    expect((await agent()).state().pausedSeconds).toBeGreaterThan(4100);
    await call("/master/batch", "POST", {
      deviceIds: [device],
      action: "resume",
    });
    const resumed = (await agent()).state();
    expect(resumed.locked).toBe(false);
    expect(resumed.endsAt).toBeGreaterThan(Date.now() + 4000000);
    expect(
      (
        await call("/master/batch", "POST", {
          deviceIds: [device],
          action: "unlock",
        })
      ).statusCode,
    ).toBe(200);
    expect((await agent()).state().endsAt).toBe(null);
  });
  it("rolls back every device on a failed mixed batch", async () => {
    await call("/master/batch", "POST", {
      deviceIds: [device],
      action: "start",
      minutes: 5,
    });
    await call("/master/batch", "POST", {
      deviceIds: [second],
      action: "unlock",
    });
    expect(
      (
        await call("/master/batch", "POST", {
          deviceIds: [device, second],
          action: "pause",
        })
      ).statusCode,
    ).toBe(409);
    const state = (await agent()).state();
    expect(state.locked).toBe(false);
    expect(state.endsAt).toBeGreaterThan(Date.now());
    expect(
      (
        await call("/master/batch", "POST", {
          deviceIds: [device, foreign],
          action: "lock",
        })
      ).statusCode,
    ).toBe(404);
    expect((await agent()).state().locked).toBe(false);
  });
  it("saves layout, notes, classroom profiles and group assignment", async () => {
    expect(
      (
        await call(`/master/devices/${device}/layout`, "PATCH", {
          room: "Lab 1",
          x: 2,
          y: 3,
          notes: "Window seat",
        })
      ).statusCode,
    ).toBe(200);
    const p = await call("/master/profiles", "POST", {
      name: "Math",
      apps: ["C:\\Windows\\System32\\notepad.exe"],
      sites: ["https://example.org"],
    });
    expect(p.statusCode).toBe(200);
    expect(
      (
        await call("/master/profiles", "POST", {
          name: "Unsafe",
          apps: ["cmd.exe"],
          sites: ["javascript:alert(1)"],
        })
      ).statusCode,
    ).toBe(400);
    await call("/master/batch", "POST", {
      deviceIds: [device],
      action: "profile",
      profileId: p.json().id,
    });
    expect((await agent()).state().profile.name).toBe("Math");
    expect(
      (await call("/master/profiles/" + p.json().id, "DELETE")).statusCode,
    ).toBe(409);
    const group = await call("/groups", "POST", { name: "Computers" });
    await call("/master/batch", "POST", {
      deviceIds: [device, second],
      action: "group",
      groupId: group.json().id,
    });
    const d = (await call("/master/devices"))
      .json()
      .find((d: any) => d.id === device);
    expect(d.room).toBe("Lab 1");
    expect(d.seat_x).toBe(2);
    expect(d.group_id).toBe(group.json().id);
  });
  it("releases map positions belonging to revoked devices", async () => {
    const layout = { room: "Retired seat", x: 1, y: 1, notes: "" };
    expect(
      (await call(`/master/devices/${retired}/layout`, "PATCH", layout))
        .statusCode,
    ).toBe(200);
    expect(
      (await call(`/master/devices/${second}/layout`, "PATCH", layout))
        .statusCode,
    ).toBe(409);
    expect((await call(`/devices/${retired}`, "DELETE")).statusCode).toBe(200);
    expect(
      (await call(`/master/devices/${second}/layout`, "PATCH", layout))
        .statusCode,
    ).toBe(200);
  });
  it("binds proof to device, nonce and entire request and consumes challenges", async () => {
    const a = await agent({ revision: 4 });
    expect(a.r.statusCode).toBe(200);
    expect(
      (await call("/agent/management/sync", "POST", a.body)).statusCode,
    ).toBe(403);
    const ch = (
      await call("/agent/management/challenge", "POST", {
        organizationId: org,
        deviceId: device,
      })
    ).json();
    const payload = "{}",
      signature = createSign("SHA256")
        .update(ch.nonce + "\n" + payload)
        .sign(keys.privateKey, "base64");
    expect(
      (
        await call("/agent/management/sync", "POST", {
          organizationId: org,
          deviceId: device,
          nonce: ch.nonce,
          payload: '{"revision":100}',
          signature,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call("/agent/management/challenge", "POST", {
          organizationId: org,
          deviceId: foreign,
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe("consented file transfer protocol", () => {
  it("requires an explicit file ACL for technicians", async () => {
    expect(
      (
        await call(
          `/master/devices/${device}/files`,
          "GET",
          undefined,
          "technician",
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call(`/devices/${device}/acl`, "PUT", {
          enforced: true,
          entries: [{ userId: tech, permission: "files" }],
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          `/master/devices/${device}/files`,
          "GET",
          undefined,
          "technician",
        )
      ).statusCode,
    ).toBe(200);
  });
  it("queues chunks, supports progress, completion and cancellation", async () => {
    const bytes = Buffer.alloc(30000, 7);
    const f = await call(`/master/devices/${device}/files`, "POST", {
      name: "lesson.pdf",
      data: bytes.toString("base64"),
    });
    expect(f.statusCode).toBe(200);
    const id = f.json().id;
    const first = (await agent()).state().file;
    expect(first.id).toBe(id);
    expect(Buffer.from(first.data, "base64").length).toBe(24576);
    const last = (await agent({ fileId: id, offset: 24576 })).state().file;
    expect(Buffer.from(last.data, "base64").length).toBe(5424);
    expect(
      (await call(`/master/devices/${device}/files`)).json()[0].transferred,
    ).toBe(24576);
    expect((await agent({ fileId: id, result: "complete" })).state().file).toBe(
      null,
    );
    expect(
      (await call(`/master/devices/${device}/files`)).json()[0].status,
    ).toBe("complete");
    await call(`/master/devices/${device}/files/${id}`, "DELETE");
    expect(
      (await call(`/master/devices/${device}/files`)).json()[0].status,
    ).toBe("cancelled");
  });
  it("accepts locally chosen uploads idempotently and restricts downloads", async () => {
    const id = randomUUID(),
      upload = {
        id,
        name: "shared.txt",
        size: 5,
        offset: 0,
        data: Buffer.from("hello").toString("base64"),
      };
    expect((await agent({ upload })).state().uploadAck).toEqual({
      id,
      offset: 5,
    });
    expect((await agent({ upload })).state().uploadAck).toEqual({
      id,
      offset: 5,
    });
    const result = await call(`/master/devices/${device}/files/${id}`);
    expect(result.statusCode).toBe(200);
    expect(result.rawPayload.toString()).toBe("hello");
    expect(
      (
        await call(
          `/master/devices/${device}/files/${id}`,
          "GET",
          undefined,
          "viewer",
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await call(`/master/devices/${second}/files/${id}`)).statusCode,
    ).toBe(404);
    expect(
      (
        await agent({
          upload: { ...upload, data: Buffer.from("other").toString("base64") },
        })
      ).r.statusCode,
    ).toBe(409);
  });
  it("rejects unsafe filenames and scoped agent completion forgery", async () => {
    expect(
      (
        await call(`/master/devices/${device}/files`, "POST", {
          name: "../bad.exe",
          data: "YQ==",
        })
      ).statusCode,
    ).toBe(400);
    const f = (
      await call(`/master/devices/${device}/files`, "POST", {
        name: "a.txt",
        data: "YQ==",
      })
    ).json();
    await agent({ fileId: f.id, result: "complete" }, second);
    expect(
      (await call(`/master/devices/${device}/files`))
        .json()
        .find((x: any) => x.id === f.id).status,
    ).toBe("pending");
    await agent({ fileId: f.id, result: "rejected" });
    expect(
      (await call(`/master/devices/${device}/files`))
        .json()
        .find((x: any) => x.id === f.id).status,
    ).toBe("rejected");
  });
});
