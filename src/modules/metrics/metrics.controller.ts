import { Controller, Get, Res } from "@nestjs/common";
import {
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiProduces,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PrometheusController } from "@willsoto/nestjs-prometheus";
import { MetricsAuthentication } from "../../guards/metrics-token.guard.js";

@Controller()
@ApiBearerAuth()
export class MetricsController extends PrometheusController {
  @Get()
  @ApiOperation({ operationId: "metrics" })
  @MetricsAuthentication()
  @ApiProduces("text/plain")
  @ApiOkResponse({
    description: "Prometheus metrics in text exposition format",
    schema: { type: "string" },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid metrics token" })
  override index(
    @Res({ passthrough: true }) response: unknown,
  ): Promise<string> {
    return super.index(response);
  }
}
