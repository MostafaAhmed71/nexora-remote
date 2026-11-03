import { test, expect } from "@playwright/test";
test("login page is Arabic RTL and handles failed authentication", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, json: { error: "Login required" } }),
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 401, json: { error: "Invalid credentials" } }),
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByLabel("البريد الإلكتروني").fill("invalid@example.test");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("invalidpassword");
  await page.getByLabel("رمز MFA", { exact: false }).fill("000000");
  await page.getByRole("button", { name: "دخول آمن" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid credentials");
});
test("mobile login is usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, json: { error: "Login required" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "دخول آمن" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("real backend login, tenant selection and enrollment issuance", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("البريد الإلكتروني").fill("e2e@example.test");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("E2E-Only-Password!42");
  await page.getByLabel("رمز MFA", { exact: false }).fill("000000");
  await page.getByRole("button", { name: "دخول آمن" }).click();
  await expect(
    page.getByRole("heading", { name: "نظرة عامة", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("المؤسسة", { exact: true })
    .selectOption({ label: "E2E Test Organization" });
  await page.getByRole("link", { name: "تسجيل جهاز", exact: true }).click();
  await page.getByRole("button", { name: "إنشاء رمز تسجيل" }).click();
  await expect(page.locator("pre")).toContainText("expiresIn");
  await expect(page.locator("pre")).toContainText("600");
});

test("viewer relays simulated frames, applies quality and Unicode input, then terminates", async ({
  page,
}) => {
  const { generateKeyPairSync, createSign } = await import("node:crypto");
  const { WebSocket } = await import("ws");
  const { once } = await import("node:events");
  await page.goto("/");
  await page.getByLabel("البريد الإلكتروني").fill("e2e@example.test");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("E2E-Only-Password!42");
  await page.getByRole("button", { name: "دخول آمن" }).click();
  await expect(
    page.getByRole("heading", { name: "نظرة عامة", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("المؤسسة", { exact: true })
    .selectOption({ label: "E2E Test Organization" });
  const org = await page.evaluate(() => sessionStorage.getItem("organization"));
  const headers = {
    origin: new URL(page.url()).origin,
    "x-organization-id": org!,
  };
  const enrollment = await (
    await page.request.post("/api/enrollments", { headers, data: {} })
  ).json();
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 3072,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const device = await (
    await page.request.post("/api/agent/enroll", {
      headers,
      data: {
        organizationId: org,
        token: enrollment.token,
        name: "SIMULATED E2E DEVICE",
        publicKey: keys.publicKey,
        os: "TEST FIXTURE",
        version: "0.2.0-test",
      },
    })
  ).json();
  const nonce = (
    await (
      await page.request.post("/api/agent/challenge", {
        headers,
        data: { deviceId: device.id, organizationId: org },
      })
    ).json()
  ).nonce;
  const signature = createSign("SHA256")
    .update(nonce)
    .sign(keys.privateKey, "base64");
  const proof = await (
    await page.request.post("/api/agent/prove", {
      headers,
      data: { organizationId: org, deviceId: device.id, nonce, signature },
    })
  ).json();
  const jpeg = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 160;
      c.height = 90;
      const g = c.getContext("2d")!;
      g.fillStyle = "#2257db";
      g.fillRect(0, 0, 160, 90);
      return c.toDataURL("image/jpeg").split(",")[1];
    }),
    "base64",
  );
  const agent = new WebSocket(
    new URL("/api/socket", page.url()).toString().replace(/^http/, "ws"),
    {
      headers: { authorization: "Bearer " + proof.ticket },
    },
  );
  const commands: any[] = [];
  let session = "";
  agent.on("message", (data) => {
    if (data.toString() === "pong") return;
    const msg = JSON.parse(data.toString());
    commands.push(msg);
    if (msg.type === "grant")
      session = JSON.parse(
        Buffer.from(msg.grant.split(".")[0], "base64url").toString(),
      ).sessionId;
  });
  await once(agent, "open");
  const stream = setInterval(() => {
    if (agent.readyState === 1) {
      agent.send("ping");
      agent.send(JSON.stringify({ type: "health", interactive: true }));
      if (session) agent.send(Buffer.concat([Buffer.from(session), jpeg]));
    }
  }, 100);
  try {
    await page.getByRole("link", { name: "الأجهزة", exact: true }).click();
    await page
      .getByLabel("معرف الجهاز", { exact: true })
      .first()
      .fill(device.id);
    await page.getByLabel("نوع الوصول").selectOption("control");
    await page.getByRole("button", { name: "اتصال", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("جلسة مصرح بها");
    await expect(
      page.getByRole("button", { name: "الملفات — غير متاح" }),
    ).toBeDisabled();
    await expect(page.locator("canvas")).toHaveAttribute("width", "160");
    await page.getByLabel("الجودة", { exact: true }).selectOption("low");
    await expect
      .poll(() =>
        commands.some((x) => x.type === "quality" && x.settings.width === 800),
      )
      .toBe(true);
    await page
      .getByLabel("كتابة Unicode / عربي من لوحة هاتف أو IME")
      .fill("مرحبا");
    await page.getByRole("button", { name: "كتابة النص على الجهاز" }).click();
    await expect
      .poll(() =>
        commands.some(
          (x) =>
            x.type === "input" &&
            x.event.kind === "text" &&
            x.event.text === "مرحبا",
        ),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "إنهاء الجلسة", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "الأجهزة", exact: true }),
    ).toBeVisible();
  } finally {
    clearInterval(stream);
    agent.close();
  }
});
