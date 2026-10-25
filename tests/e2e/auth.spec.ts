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
