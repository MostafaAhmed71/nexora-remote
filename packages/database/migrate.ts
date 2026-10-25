import { readFile } from "node:fs/promises";
import { pool } from "./index.js";
const db = pool(process.env.DATABASE_URL!);
const client = await db.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(720261025)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY)",
  );
  if (
    !(await client.query("SELECT 1 FROM schema_migrations WHERE version='001'"))
      .rowCount
  ) {
    await client.query(
      await readFile("packages/database/migrations/001_initial.sql", "utf8"),
    );
    await client.query("INSERT INTO schema_migrations VALUES ('001')");
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await db.end();
}
