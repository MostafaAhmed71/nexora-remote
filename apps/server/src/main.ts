import { recoveryDelivery } from "./recovery-delivery.js";
import { readFileSync } from "node:fs";
import { pool, tenant } from "../../../packages/database/index.js";
import { createApp } from "./app.js";
const db = pool(process.env.DATABASE_URL!);
const app = await createApp({
  deliverReset: recoveryDelivery({
    url: process.env.RESET_DELIVERY_URL,
    bearer: process.env.RESET_DELIVERY_BEARER,
    origin: process.env.ORIGIN ?? "http://localhost:5173",
  }),
  db,
  run: (org, fn) => tenant(db, org, fn),
  origin: process.env.ORIGIN ?? "http://localhost:5173",
  mfaKey: Buffer.from(process.env.MFA_KEY ?? "", "hex"),
  signingKey: readFileSync(process.env.SIGNING_KEY_FILE!, "utf8"),
  publicKey: readFileSync(process.env.PUBLIC_KEY_FILE!, "utf8"),
  production: process.env.NODE_ENV === "production",
});
await app.listen({
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "127.0.0.1",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close().then(() => db.end());
  });
