require("reflect-metadata");
require("../apps/api/dist/src/instrumentation");
const { createMarketplaceApp } = require("../apps/api/dist/src/bootstrap");

let expressApp;

module.exports = async function handler(request, response) {
  if (!expressApp) {
    const app = await createMarketplaceApp({ serverless: true });
    await app.init();
    expressApp = app.getHttpAdapter().getInstance();
  }
  return expressApp(request, response);
};
