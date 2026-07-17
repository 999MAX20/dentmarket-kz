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
  expect(errors).toEqual([]);
}

test("buyer can search and compare marketplace offers", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3001");
  await expect(page.getByRole("heading", { name: "Найдите нужное для клиники" })).toBeVisible();
  await expect(page.getByText("Перчатки нитриловые SafeTouch Ultra", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сравнить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сравнение предложений" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo Dental Supply" })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("supplier can switch organization and inspect offers", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3002");
  await expect(page.getByRole("heading", { name: "Добрый день, Demo Dental Supply" })).toBeVisible();
  await page.getByRole("combobox", { name: "Организация поставщика" }).selectOption({ label: "MedConsum" });
  await expect(page.getByText("Шымкент · Поставщик", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Предложения", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Предложения и цены" })).toBeVisible();
  await expect(page.getByText("Перчатки нитриловые SafeTouch Ultra", { exact: true })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("active EDS agreement hides the signing action", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3002");
  await page.getByRole("button", { name: "Договор с платформой", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Договор действует" })).toBeVisible();
  await expect(page.getByText("ЭЦП проверена", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Подписать ЭЦП от платформы" })).toHaveCount(0);
  await expect(page.getByText("Автоматически каждый год", { exact: true })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("buyer has budgets, support and tenant-aware AI workspaces", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3001");
  await page.getByRole("button", { name: "Списки и бюджеты", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Списки и бюджеты" })).toBeVisible();
  await page.getByRole("button", { name: "Поддержка", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Поддержка" })).toBeVisible();
  await page.getByRole("button", { name: "AI-помощник", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI-помощник по закупкам" })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("buyer receives explainable city-aware scenarios", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3001");
  await page.getByRole("button", { name: "Город и рекомендации", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Цена, срок и доверие в одном выборе" })).toBeVisible();
  await expect(page.getByText("Адрес подтверждён", { exact: true })).toBeVisible();
  await expect(page.getByText("Рекомендуемый сценарий", { exact: true })).toBeVisible();
  const recommendedScenario = page.locator("article").filter({ hasText: "Рекомендуемый сценарий" });
  await expect(recommendedScenario.getByRole("heading", { level: 3 })).toBeVisible();
  await expect(recommendedScenario.getByText("Итого", { exact: true })).toBeVisible();
  await expect(recommendedScenario.getByText("Ожидаемый срок", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Самый выгодный/ }).click();
  await expect(page.getByText("Органический порядок сохраняется.")).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("supplier sees explainable trust and verified warehouses", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3002");
  await page.getByRole("button", { name: "Доверие и география", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Рейтинг отражает исполнение, а не рекламный бюджет" })).toBeVisible();
  await expect(page.getByText("Надёжность поставщика", { exact: true })).toBeVisible();
  await expect(page.getByText("Основной склад Алматы", { exact: true })).toBeVisible();
  await expect(page.getByText("Подтверждён", { exact: true }).first()).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("public landing routes both marketplace audiences", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3003");
  await expect(page.getByRole("heading", { name: "Материалы приходят вовремя. Цены — без тумана." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Зарегистрировать клинику" }).first()).toHaveAttribute("href", "/register?role=buyer");
  await expect(page.getByRole("link", { name: "Я поставщик" })).toHaveAttribute("href", "/register?role=supplier");
  await expect(page.getByRole("heading", { name: "Договор подписывается только тогда, когда нужен" })).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("new supplier completes registration and receives a secure cabinet handoff", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const suffix = String(Date.now()).slice(-10);
  await page.goto("http://127.0.0.1:3003/register?role=supplier");
  await page.getByLabel("ФИО владельца").fill("E2E Владелец");
  await page.getByLabel("Рабочий email").fill(`e2e-${suffix}@example.kz`);
  await page.getByLabel("Юридическое наименование").fill(`ТОО E2E ${suffix}`);
  await page.getByLabel("Название в кабинете").fill(`E2E Supply ${suffix}`);
  await page.getByLabel("БИН", { exact: true }).fill(`99${suffix}`.slice(0, 12));
  await page.getByRole("checkbox", { name: "Принимаю условия использования" }).check();
  await page.getByRole("checkbox", { name: "Согласен с политикой конфиденциальности" }).check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("heading", { name: "Подтвердите личность" })).toBeVisible();
  await page.getByRole("button", { name: "Завершить локальную регистрацию" }).click();
  await expect(page.getByRole("heading", { name: "Организация создана" })).toBeVisible();
  await page.getByRole("link", { name: "Перейти в кабинет" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:3002\/$/);
  await expect(page.getByRole("heading", { name: new RegExp(`E2E Supply ${suffix}`) })).toBeVisible();
  expect(await page.evaluate(() => window.location.hash)).toBe("");
  await expectHealthyPage(page, errors);
});

test("operator sees production assurance controls", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto("http://127.0.0.1:3000");
  await expect(page.getByRole("heading", { name: "Операционный контур" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Контроль промышленного контура" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Перестроить поиск" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trust & Smart Commerce" })).toBeVisible();
  await expect(page.getByText("UNRELIABLE_STOCK", { exact: true })).toBeVisible();
  await expectHealthyPage(page, errors);
});
