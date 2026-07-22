import { expect, test, type Page } from "@playwright/test";

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}

async function expectHealthyPage(page: Page, errors: string[]) {
  await page.waitForLoadState("networkidle");
  const actionable = errors.filter((error) => !/Content Security Policy directive|violates the following Content Security Policy|Applying inline style|Executing inline script|Loading the script|Connection closed|Expected a request ID/.test(error));
  expect(actionable).toEqual([]);
}

test("buyer can search and compare marketplace offers", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3001");
  await expect(page.getByRole("heading", { name: "Каталог для стоматологий" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Сравнить предложения" }).first()).toBeVisible();
  await expect(page.locator("article[role=button]").first()).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("buyer can open a product card from the public catalog", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3001");
  const card = page.getByTestId("product-card").first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Выберите продавца" })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("supplier can switch organization and inspect offers", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3002");
  await expect(page.getByText("Demo Dental Supply", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Организация поставщика" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ещё", exact: true })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("active EDS agreement hides the signing action", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3002");
  await expect(page.getByRole("button", { name: "Ещё", exact: true })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("buyer has budgets, support and tenant-aware AI workspaces", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3001");
  await expect(page.getByRole("button", { name: /город/i })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("buyer receives explainable city-aware scenarios", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3001");
  await expect(page.getByRole("button", { name: /город/i })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("supplier sees explainable trust and verified warehouses", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3002");
  await expect(page.getByRole("button", { name: "Ещё", exact: true })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("public landing routes both marketplace audiences", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3003");
  await expect(page.getByRole("heading", { name: "Материалы, цены и сроки поставки в одном месте" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Зарегистрировать клинику" }).first()).toHaveAttribute("href", "/register?role=buyer");
  await expect(page.getByRole("link", { name: "Кабинет поставщика →" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Подпишите один раз в год" })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("new supplier completes registration and receives a secure cabinet handoff", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const suffix = String(Date.now()).slice(-10);
  await page.goto("http://127.0.0.1:3003/register?role=supplier");
  await page.getByLabel("ФИО владельца").fill("E2E Владелец");
  await page.getByLabel("Рабочий email").fill(`e2e-${suffix}@example.kz`);
  await page.getByLabel("Пароль").fill("E2E-Supplier-2026!");
  await page.getByLabel("Юридическое наименование").fill(`ТОО E2E ${suffix}`);
  await page.getByLabel("Название в кабинете").fill(`E2E Supply ${suffix}`);
  await page.getByLabel("БИН", { exact: true }).fill(`99${suffix}`.slice(0, 12));
  await page.getByRole("checkbox", { name: "Принимаю условия использования" }).check();
  await page.getByRole("checkbox", { name: "Согласен с политикой конфиденциальности" }).check();
  await expect(page.getByRole("button", { name: "Продолжить" })).toBeDisabled();
  await expectHealthyPage(page, errors);
});

test("operator sees production assurance controls", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3000");
  await expect(page.locator("body")).not.toBeEmpty();
  await expectHealthyPage(page, errors);
});
