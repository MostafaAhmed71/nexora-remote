import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import argon2 from "argon2";
import { pool } from "../../packages/database/index.js";
// Explicit operator bootstrap; not a seed, not invoked by production startup or tests.
const email = process.env.BOOTSTRAP_EMAIL,
  password = process.env.BOOTSTRAP_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error("Explicit bootstrap email and password (12+ chars) required");
const db = pool(process.env.DATABASE_URL!);
try {
  if ((await db.query("SELECT id FROM users LIMIT 1")).rowCount)
    throw new Error("Bootstrap is allowed only in an empty installation");
  await db.query(
    "INSERT INTO users(id,email,password_hash,platform_admin) VALUES($1,$2,$3,true)",
    [
      randomUUID(),
      email.toLowerCase(),
      await argon2.hash(password, { type: argon2.argon2id }),
    ],
  );
} finally {
  await db.end();
}
if (!existsSync("artifacts/keys/private.pem")) {
  mkdirSync("artifacts/keys", { recursive: true, mode: 0o700 });
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 3072,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync("artifacts/keys/private.pem", keys.privateKey, { mode: 0o600 });
  writeFileSync("artifacts/keys/public.pem", keys.publicKey);
  writeFileSync("artifacts/keys/mfa.key", randomBytes(32).toString("hex"), {
    mode: 0o600,
  });
}
