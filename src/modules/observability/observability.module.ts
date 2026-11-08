import { Module } from "@nestjs/common";
import { ObservabilityController } from "./observability.controller.js";
import { FaroRateLimitService } from "./faro-rate-limit.service.js";

@Module({
  controllers: [ObservabilityController],
  providers: [FaroRateLimitService],
})
export class ObservabilityModule {}
