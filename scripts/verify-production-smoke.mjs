const apiBase = (process.env.SMOKE_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api").replace(/\/$/, "");
const webBase = (process.env.SMOKE_WEB_URL ?? "https://dentmarket-shop.vercel.app").replace(/\/$/, "");

if (!apiBase && !webBase) {
  console.error("Set SMOKE_API_URL and/or SMOKE_WEB_URL");
  process.exit(2);
}

const checks = [];
async function check(name, url, expectedStatuses = [200]) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json,text/html" },
    });
    const contentType = response.headers.get("content-type") ?? "";
    checks.push({ name, url, status: response.status, ok: expectedStatuses.includes(response.status), contentType });
  } catch (error) {
    checks.push({ name, url, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

if (apiBase) {
  await check("api-health", `${apiBase}/health`);
  await check("api-readiness", `${apiBase}/health/ready`);
  await check("public-catalog", `${apiBase}/catalog/search?limit=1&offset=0`);
}
if (webBase) await check("web-home", webBase);

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
if (checks.some((check) => !check.ok)) process.exit(1);
