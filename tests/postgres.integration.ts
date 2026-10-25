// Only against a disposable CI database. All DDL and fixtures are rolled back.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
if (!process.env.TEST_DATABASE_URL)
  throw new Error("Disposable TEST_DATABASE_URL required");
const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN");
  await c.query(
    (await readFile("packages/database/migrations/001_initial.sql", "utf8")) +
      (await readFile("packages/database/migrations/002_security.sql", "utf8")),
  );
  const a = randomUUID(),
    b = randomUUID(),
    uid = randomUUID();
  await c.query("INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)", [
    a,
    "CI A",
    b,
    "CI B",
  ]);
  await c.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [
    uid,
    "ci@example.test",
    "never-login-fixture",
  ]);
  await c.query(
    "INSERT INTO memberships VALUES($1,$2,'owner'),($3,$2,'owner')",
    [a, uid, b],
  );
  await c.query(
    "CREATE ROLE nexora_ci_runtime NOSUPERUSER NOBYPASSRLS;GRANT USAGE ON SCHEMA public TO nexora_ci_runtime;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexora_ci_runtime;SET LOCAL ROLE nexora_ci_runtime",
  );
  assert.equal((await c.query("SELECT * FROM memberships")).rowCount, 0);
  await c.query("SELECT set_config('app.org_id',$1,true)", [a]);
  assert.equal((await c.query("SELECT * FROM memberships")).rowCount, 1);
  const group = randomUUID();
  await c.query("INSERT INTO device_groups VALUES($1,$2,$3)", [
    group,
    a,
    "CI group",
  ]);
  await c.query("SAVEPOINT cross_tenant");
  await assert.rejects(
    c.query("INSERT INTO device_groups VALUES($1,$2,$3)", [
      randomUUID(),
      b,
      "denied",
    ]),
  );
  await c.query("ROLLBACK TO SAVEPOINT cross_tenant");
  await c.query("SELECT set_config('app.org_id',$1,true)", [b]);
  assert.equal((await c.query("SELECT * FROM device_groups")).rowCount, 0);
  await c.query("SAVEPOINT foreign_key");
  await assert.rejects(
    c.query(
      "INSERT INTO devices(id,org_id,group_id,name,public_key,os,agent_version) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [randomUUID(), b, group, "fixture", "fixture", "Windows", "test"],
    ),
  );
  await c.query("ROLLBACK TO SAVEPOINT foreign_key");
  console.log(
    "5 native PostgreSQL migration/RLS/tenant constraint checks passed",
  );
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
