import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { AuthorizationGuard } from "./guards/authorization.guard.js";
import type { AuthOptions } from "express-oauth2-jwt-bearer";
import { requestLogger } from "./logging/request-logger.js";
import { requestLoggingMiddleware } from "./logging/request-logging.middleware.js";
import { json } from "express";
import { FARO_PAYLOAD_LIMIT_BYTES } from "./constants.js";
import type { Request, Response, NextFunction } from "express";

type RequestWithRawBody = Request & { rawBody?: Buffer };

function captureRawBody(
  request: Request,
  _response: Response,
  buffer: Buffer,
): void {
  (request as RequestWithRawBody).rawBody = Buffer.from(buffer);
}

export function configureApp(
  app: INestApplication,
  options: { authorization?: AuthOptions } = {},
): void {
  app.enableCors({
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : false,
  });
  app.useLogger(requestLogger);
  app.use(requestLoggingMiddleware);
  // Keep the normal API parser limit while allowing Faro's configured window
  // to accept a single payload up to its full per-minute byte budget.
  const regularJsonParser = json({ limit: "100kb", verify: captureRawBody });
  const faroJsonParser = json({
    limit: FARO_PAYLOAD_LIMIT_BYTES,
    verify: captureRawBody,
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const parser =
      request.path === "/observability/faro/collect"
        ? faroJsonParser
        : regularJsonParser;
    parser(request, response, next);
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalGuards(new AuthorizationGuard(options.authorization));
}
