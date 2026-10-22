import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { AuthorizationGuard } from "./guards/authorization.guard.js";
import type { AuthOptions } from "express-oauth2-jwt-bearer";
import { requestLogger } from "./logging/request-logger.js";
import { requestLoggingMiddleware } from "./logging/request-logging.middleware.js";

export function configureApp(
  app: INestApplication,
  options: { authorization?: AuthOptions } = {},
): void {
  app.enableCors({
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : false,
  });
  app.useLogger(requestLogger);
  app.use(requestLoggingMiddleware);
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalGuards(new AuthorizationGuard(options.authorization));
}
