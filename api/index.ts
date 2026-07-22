import "../apps/api/src/instrumentation";
import "reflect-metadata";
import type { Request, Response } from "express";
import { createMarketplaceApp } from "../apps/api/src/bootstrap";

let expressApp: ((request: Request, response: Response) => void) | undefined;

export default async function handler(request: Request, response: Response) {
  try {
    if (!expressApp) {
      const app = await createMarketplaceApp({ serverless: true });
      await app.init();
      expressApp = app.getHttpAdapter().getInstance() as (request: Request, response: Response) => void;
    }
    return expressApp(request, response);
  } catch (error) {
    const path = request.url ?? "";
    const dependencyError = error instanceof Error ? error.message : "runtime initialization failed";
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.statusCode = path.startsWith("/api/health") || path.startsWith("/health") ? 200 : 503;
    return response.end(JSON.stringify(
      response.statusCode === 200
        ? { status: "degraded", service: "marketplace-api", database: "unavailable", error: dependencyError }
        : { statusCode: 503, error: "Service Unavailable", message: "API dependencies are temporarily unavailable", dependency: dependencyError },
    ));
  }
}
