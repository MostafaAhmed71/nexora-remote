import { readFile, readdir } from "node:fs/promises";
import { pool } from "./index.js";
const db = pool(process.env.DATABASE_URL!);
const client = await db.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(720261025)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY)",
  );
  for (const file of (await readdir("packages/database/migrations"))
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort()) {
    const version = file.split("_")[0];
    if (
      !(
        await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [
          version,
        ])
      ).rowCount
    ) {
      await client.query(
        await readFile("packages/database/migrations/" + file, "utf8"),
      );
      await client.query("INSERT INTO schema_migrations VALUES($1)", [version]);
    }
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await db.end();
}
