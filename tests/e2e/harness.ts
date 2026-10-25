// Ephemeral E2E installation. Never imported by application entry points.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID, generateKeyPairSync, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { createApp } from "../../apps/server/src/app.js";
import type { DB } from "../../packages/database/index.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Test harness forbidden in production");
const db = new PGlite();
await db.exec(
  (await readFile("packages/database/migrations/001_initial.sql", "utf8")) +
    (await readFile("packages/database/migrations/002_security.sql", "utf8")),
);
const org = randomUUID(),
  user = randomUUID();
await db.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
  org,
  "E2E Test Organization",
]);
await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [
  user,
  "e2e@example.test",
  await argon2.hash("E2E-Only-Password!42"),
]);
await db.query("INSERT INTO memberships VALUES($1,$2,'owner')", [org, user]);
await db.exec(
  "CREATE ROLE e2e_app;GRANT USAGE ON SCHEMA public TO e2e_app;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO e2e_app;GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO e2e_app;SET ROLE e2e_app",
);
const adapter = (d: any): DB => ({
  query: (sql, params) => d.query(sql, params),
});
const k = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const app = await createApp({
  db: adapter(db),
  run: (org, fn) =>
    db.transaction(async (tx) => {
      await tx.query("SELECT set_config('app.org_id',$1,true)", [org]);
      return fn(adapter(tx));
    }),
  origin: "http://127.0.0.1:5173",
  mfaKey: randomBytes(32),
  signingKey: k.privateKey,
  publicKey: k.publicKey,
});
await app.listen({ host: "127.0.0.1", port: 3000 });
for (const s of ["SIGINT", "SIGTERM"])
  process.on(s, () => {
    void app
      .close()
      .then(() => db.close())
      .then(() => process.exit(0));
  });
