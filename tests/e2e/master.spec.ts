import { test, expect } from "@playwright/test";
import { generateKeyPairSync, createSign } from "node:crypto";

test("master manages packages, timers, rooms and transfer queue through the real API", async ({
  page,
}) => {
  test.setTimeout(60000);
  const packageName = `Master package ${Date.now()}`;
  await page.goto("/");
  await page.locator('[name="email"]').fill("e2e@example.test");
  await page.locator('[name="password"]').fill("E2E-Only-Password!42");
  await page.locator("form button").click();
  await page
    .getByLabel("المؤسسة", { exact: true })
    .selectOption({ label: "E2E Test Organization" });
  const org = await page.evaluate(() => sessionStorage.getItem("organization"));
  const headers = {
    origin: new URL(page.url()).origin,
    "x-organization-id": org!,
  };
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const enrollment = await (
    await page.request.post("/api/enrollments", { headers, data: {} })
  ).json();
  const device = await (
    await page.request.post("/api/agent/enroll", {
      headers,
      data: {
        organizationId: org,
        token: enrollment.token,
        name: "MASTER TEST PC",
        publicKey: keys.publicKey,
        os: "TEST FIXTURE",
        version: "test",
      },
    })
  ).json();
  expect(device.id).toBeTruthy();
  async function sync(revision?: number) {
    const ch = await (
      await page.request.post("/api/agent/management/challenge", {
        headers,
        data: { organizationId: org, deviceId: device.id },
      })
    ).json();
    const payload = JSON.stringify(revision === undefined ? {} : { revision });
    const signature = createSign("SHA256")
      .update(ch.nonce + "\n" + payload)
      .sign(keys.privateKey, "base64");
    const r = await page.request.post("/api/agent/management/sync", {
      headers,
      data: {
        organizationId: org,
        deviceId: device.id,
        nonce: ch.nonce,
        payload,
        signature,
      },
    });
    expect(r.status()).toBe(200);
    const signed = (await r.json()).signed;
    return JSON.parse(
      Buffer.from(signed.split(".")[0], "base64url").toString(),
    );
  }
  try {
    await page.getByRole("link", { name: "لوحة الماستر", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "الأجهزة وإدارة المجموعات" }),
    ).toBeVisible();
    await page.getByLabel("اسم الباقة", { exact: true }).fill(packageName);
    await page.getByLabel("مدة الباقة بالدقائق").fill("45");
    await page.getByRole("button", { name: "إضافة باقة", exact: true }).click();
    await expect(
      page
        .getByLabel("باقة الوقت")
        .getByRole("option", { name: `${packageName} — 45 دقيقة` }),
    ).toHaveCount(1);
    await page.getByLabel("تحديد MASTER TEST PC", { exact: true }).check();
    await page
      .getByLabel("باقة الوقت")
      .selectOption({ label: `${packageName} — 45 دقيقة` });
    await page.getByRole("button", { name: "بدء الوقت", exact: true }).click();
    await expect
      .poll(async () => (await sync()).endsAt)
      .toBeGreaterThan(Date.now() + 40 * 60000);
    await page
      .getByRole("button", { name: "إيقاف مؤقت وقفل", exact: true })
      .click();
    await expect.poll(async () => (await sync()).locked).toBe(true);
    await page
      .getByRole("button", { name: "استئناف الوقت", exact: true })
      .click();
    await expect.poll(async () => (await sync()).locked).toBe(false);
    await page.getByRole("button", { name: "قفل جماعي", exact: true }).click();
    await expect.poll(async () => (await sync()).locked).toBe(true);
    await page
      .getByRole("button", { name: "فتح وإلغاء المؤقت", exact: true })
      .click();
    await expect.poll(async () => (await sync()).endsAt).toBe(null);
    await page.getByLabel("تعديل مكان جهاز").selectOption(device.id);
    await page.getByLabel("اسم القاعة", { exact: true }).fill("قاعة اختبار");
    await page.getByLabel("العمود (0–20)").fill("2");
    await page.getByLabel("الصف (0–20)").fill("1");
    await page.getByRole("button", { name: "حفظ المكان" }).click();
    await expect(
      page.getByRole("group", { name: "خريطة قاعة اختبار" }),
    ).toBeVisible();
    await page.getByLabel("جهاز نقل الملفات").selectOption(device.id);
    await page.getByLabel("إرسال ملف للجهاز").setInputFiles({
      name: "lesson.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("classroom lesson"),
    });
    await expect(page.getByText("lesson.txt", { exact: true })).toBeVisible();
    const state = await sync();
    expect(Buffer.from(state.file.data, "base64").toString()).toBe(
      "classroom lesson",
    );
    await sync(state.revision);
    const row = page.getByRole("row").filter({ hasText: "MASTER TEST PC" });
    await expect(row).toContainText("تم التطبيق", { timeout: 10000 });
    await page.screenshot({
      path: "artifacts/master-console.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/master-console-mobile.png",
      fullPage: true,
    });
  } finally {
    await page.request
      .delete(`/api/devices/${device.id}`, { headers })
      .catch(() => {});
  }
});
