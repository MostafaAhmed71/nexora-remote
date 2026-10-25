import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createSign,
  createVerify,
} from "node:crypto";
export const token = () => randomBytes(32).toString("base64url");
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function seal(s: string, key: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  return (() => {
    const b = Buffer.concat([c.update(s), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), b]).toString("base64");
  })();
}
export function unseal(s: string, key: Buffer) {
  const b = Buffer.from(s, "base64");
  const c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  c.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString();
}
export function signGrant(payload: object, key: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const s = createSign("SHA256");
  s.update(body);
  return body + "." + s.sign(key, "base64url");
}
export function verifyProof(key: string, message: string, signature: string) {
  try {
    const v = createVerify("SHA256");
    v.update(message);
    return v.verify(key, signature, "base64");
  } catch {
    return false;
  }
}
