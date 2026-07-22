import "../apps/api/src/instrumentation";
import "reflect-metadata";
import type { Request, Response } from "express";
import { createMarketplaceApp } from "../apps/api/src/bootstrap";

let expressApp: ((request: Request, response: Response) => void) | undefined;

export default async function handler(request: Request, response: Response) {
  if (!expressApp) {
    const app = await createMarketplaceApp({ serverless: true });
    await app.init();
    expressApp = app.getHttpAdapter().getInstance() as (request: Request, response: Response) => void;
  }
  return expressApp(request, response);
}
