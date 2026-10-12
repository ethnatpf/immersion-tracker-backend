import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.auth?.payload.sub;

    if (!userId) {
      throw new UnauthorizedException("Missing authenticated user");
    }

    return userId;
  },
);
