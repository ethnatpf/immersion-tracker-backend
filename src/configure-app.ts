import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { AuthorizationGuard } from "./guards/authorization.guard.js";
import type { AuthOptions } from "express-oauth2-jwt-bearer";

export function configureApp(
  app: INestApplication,
  options: { authorization?: AuthOptions } = {},
): void {
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalGuards(new AuthorizationGuard(options.authorization));
}
