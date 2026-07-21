import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { environment } from "./platform/config/environment";
import { jsonSafeReplacer } from "./platform/http/json-safe-replacer";
import {
  httpLoggerMiddleware,
  NestStructuredLogger,
} from "./platform/observability/structured-logger";
import { identityContextMiddleware } from "./platform/security/identity-context.middleware";

export async function createMarketplaceApp(
  options: { serverless?: boolean } = {},
) {
  const config = environment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    rawBody: true,
    logger: new NestStructuredLogger(),
  });
  if (!options.serverless) app.enableShutdownHooks();
  app.set("json replacer", jsonSafeReplacer);
  if (config.TRUST_PROXY) app.set("trust proxy", 1);
  const cspConnect = [
    "'self'",
    ...config.CORS_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ];
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          imgSrc: ["'self'", "data:"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          connectSrc: cspConnect,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts:
        config.NODE_ENV === "production"
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
          : false,
    }),
  );
  app.use(identityContextMiddleware());
  app.use(httpLoggerMiddleware());
  app.useBodyParser("json", { limit: "32mb" });
  app.useBodyParser("urlencoded", { limit: "1mb", extended: true });
  app.setGlobalPrefix("api");
  const allowedOrigins = new Set(
    config.CORS_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  app.enableCors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
    exposedHeaders: ["x-request-id"],
  });
  const openApi = new DocumentBuilder()
    .setTitle("B2B Procurement Platform API")
    .setDescription("Industry-independent procurement core")
    .setVersion("0.1.0")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, openApi));
  return app;
}
