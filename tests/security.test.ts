import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";
import { allowed } from "../packages/shared/index.js";
import { inputSchema, acceptSequence } from "../packages/protocol/index.js";
import {
  seal,
  unseal,
  digest,
  token,
  verifyProof,
  signGrant,
} from "../apps/server/src/security.js";
describe("security primitives", () => {
  it("role grants are deny by default", () => {
    expect(allowed("unknown", "view")).toBe(false);
    expect(allowed("viewer", "control")).toBe(false);
    expect(allowed("employee", "users")).toBe(false);
    expect(allowed("technician", "control")).toBe(true);
    expect(allowed("admin", "settings")).toBe(false);
  });
  it("validates normalized input and sequences", () => {
    expect(
      inputSchema.safeParse({ kind: "move", x: 2, y: 0, seq: 1 }).success,
    ).toBe(false);
    expect(
      inputSchema.safeParse({ kind: "key", code: 999, down: true, seq: 1 })
        .success,
    ).toBe(false);
    expect(acceptSequence(5, 5)).toBe(false);
    expect(acceptSequence(5, 6)).toBe(true);
  });
  it("authenticated encryption rejects tampering", () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = seal("secret", key);
    expect(unseal(encrypted, key)).toBe("secret");
    const bytes = Buffer.from(encrypted, "base64");
    bytes[20] ^= 1;
    expect(() => unseal(bytes.toString("base64"), key)).toThrow();
  });
  it("generates unpredictable tokens stored by digest", () => {
    expect(token()).not.toBe(token());
    expect(digest("a")).toHaveLength(64);
  });
  it("verifies RSA proof and rejects different challenge", () => {
    const k = generateKeyPairSync("rsa", {
      modulusLength: 3072,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const s = createSign("SHA256")
      .update("challenge")
      .sign(k.privateKey, "base64");
    expect(verifyProof(k.publicKey, "challenge", s)).toBe(true);
    expect(verifyProof(k.publicKey, "replay", s)).toBe(false);
    expect(signGrant({ expiresAt: 1 }, k.privateKey).split(".")).toHaveLength(
      2,
    );
  });
});
