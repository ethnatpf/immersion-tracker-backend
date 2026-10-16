import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Reflector } from "@nestjs/core";
import { METRICS_AUTHENTICATION } from "./metrics-token.guard.js";
import {
  type AuthOptions,
  auth,
  InvalidTokenError,
  UnauthorizedError,
} from "express-oauth2-jwt-bearer";

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly options?: AuthOptions) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      new Reflector().getAllAndOverride<boolean>(METRICS_AUTHENTICATION, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    try {
      const validateAccessToken = auth(
        this.options ?? {
          audience: process.env.AUTH_AUDIENCE,
          issuerBaseURL: process.env.AUTH_ISSUER_BASE_URL,
          tokenSigningAlg: "RS256",
        },
      );
      await new Promise<void>((resolve, reject) => {
        validateAccessToken(request, response, (error?: unknown) => {
          if (error) reject(error);
          else resolve();
        });
      });
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw new UnauthorizedException("Bad credentials");
      }

      if (error instanceof UnauthorizedError) {
        throw new UnauthorizedException("Requires authentication");
      }

      console.error("Authorization error", error);
      throw new InternalServerErrorException();
    }

    if (!request.auth?.payload.sub) {
      throw new UnauthorizedException("Missing token subject");
    }

    return true;
  }
}
