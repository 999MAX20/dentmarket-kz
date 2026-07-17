import type { LoggerService } from "@nestjs/common";
import { trace } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";
import pino from "pino";
import pinoHttp from "pino-http";
import { environment } from "../config/environment";

const config = environment();

export const structuredLogger = pino({
  level: config.LOG_LEVEL,
  base: { service: "marketplace-api", release: process.env.APP_RELEASE ?? "local" },
  redact: { paths: ["req.headers.authorization", "req.headers.cookie", "password", "token", "secret", "credentials"], censor: "[REDACTED]" },
});

function normalize(message: unknown) { return message instanceof Error ? { message: message.message, stack: message.stack } : { message: typeof message === "string" ? message : JSON.stringify(message) }; }

export class NestStructuredLogger implements LoggerService {
  log(message: unknown, context?: string) { structuredLogger.info({ context, ...normalize(message) }); }
  error(message: unknown, traceValue?: string, context?: string) { structuredLogger.error({ context, trace: traceValue, ...normalize(message) }); }
  warn(message: unknown, context?: string) { structuredLogger.warn({ context, ...normalize(message) }); }
  debug(message: unknown, context?: string) { structuredLogger.debug({ context, ...normalize(message) }); }
  verbose(message: unknown, context?: string) { structuredLogger.trace({ context, ...normalize(message) }); }
  fatal(message: unknown, context?: string) { structuredLogger.fatal({ context, ...normalize(message) }); }
}

export function httpLoggerMiddleware() {
  return pinoHttp({
    logger: structuredLogger,
    genReqId(request, response) {
      const incoming = request.headers["x-request-id"];
      const requestId = typeof incoming === "string" && incoming.length <= 160 ? incoming : randomUUID();
      response.setHeader("x-request-id", requestId);
      return requestId;
    },
    customProps(request) {
      const correlationHeader = request.headers["x-correlation-id"];
      const span = trace.getActiveSpan()?.spanContext();
      return {
        correlationId: typeof correlationHeader === "string" ? correlationHeader : request.id,
        traceId: span?.traceId,
        actorId: request.headers["x-user-id"],
        organizationId: request.headers["x-organization-id"],
      };
    },
  });
}
