require("reflect-metadata");
require("../apps/api/dist/src/instrumentation");
const { createMarketplaceApp } = require("../apps/api/dist/src/bootstrap");

let expressApp;

module.exports = async function handler(request, response) {
  try {
    if (!expressApp) {
      const app = await createMarketplaceApp({ serverless: true });
      await app.init();
      expressApp = app.getHttpAdapter().getInstance();
    }
    return expressApp(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime initialization failed";
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.statusCode = String(request.url || "").startsWith("/api/health") ? 200 : 503;
    return response.end(JSON.stringify({ status: "degraded", service: "marketplace-api", database: "unavailable", error: message }));
  }
};
