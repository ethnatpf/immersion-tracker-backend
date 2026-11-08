import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiOperation,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request } from "express";
import { SkipThrottle } from "@nestjs/throttler";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { FARO_RECEIVER_URL } from "../../constants.js";
import { FaroCollectResponseDto } from "./dto/faro-collect-response.dto.js";
import { FaroRateLimitService } from "./faro-rate-limit.service.js";

type FaroPayload = Record<string, unknown> & {
  meta?: Record<string, unknown>;
};
type RequestWithRawBody = Request & { rawBody?: Buffer };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

@ApiBearerAuth()
@Controller("observability/faro")
export class ObservabilityController {
  constructor(private readonly rateLimit: FaroRateLimitService) {}

  @Post("collect")
  @SkipThrottle()
  @HttpCode(202)
  @ApiOperation({ operationId: "observabilityFaroCollect" })
  @ApiAcceptedResponse({ type: FaroCollectResponseDto })
  @ApiBadRequestResponse({ description: "Invalid Faro payload" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiTooManyRequestsResponse({
    description: "Faro rate or byte limit exceeded",
  })
  @ApiBadGatewayResponse({
    description: "The Alloy Faro receiver is unavailable",
  })
  async collect(
    @Body() body: unknown,
    @Req() request: Request,
    @CurrentUserId() userId: string,
  ): Promise<FaroCollectResponseDto> {
    if (!isRecord(body) || !isRecord(body.meta)) {
      throw new BadRequestException("Invalid Faro payload");
    }

    const rawBody = (request as RequestWithRawBody).rawBody;
    const payloadBytes =
      rawBody?.byteLength ?? Buffer.byteLength(JSON.stringify(body));
    this.rateLimit.consume(userId, payloadBytes);

    const payload = body as FaroPayload;
    // Replace the complete user object so client-supplied fields cannot spoof
    // user identity or attach untrusted user metadata to Faro logs.
    payload.meta = { ...payload.meta, user: { id: userId } };

    let upstream: Response;
    try {
      upstream = await fetch(
        process.env.FARO_RECEIVER_URL ?? FARO_RECEIVER_URL,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
    } catch {
      throw new BadGatewayException("Unable to reach the Faro receiver");
    }

    if (!upstream.ok) {
      throw new BadGatewayException("The Faro receiver rejected the payload");
    }

    return { accepted: true };
  }
}
