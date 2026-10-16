import { timingSafeEqual } from "node:crypto";
import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

export const METRICS_AUTHENTICATION = Symbol("metricsAuthentication");

@Injectable()
export class MetricsTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expectedToken = process.env.METRICS_TOKEN;
    const token = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? "",
    )?.[1];

    if (!expectedToken || !token) {
      throw new UnauthorizedException();
    }

    const expected = Buffer.from(expectedToken);
    const received = Buffer.from(token);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new UnauthorizedException();
    }

    return true;
  }
}

// Keep the JWT exemption and its replacement guard together.
export function MetricsAuthentication() {
  return applyDecorators(
    SetMetadata(METRICS_AUTHENTICATION, true),
    UseGuards(MetricsTokenGuard),
  );
}
