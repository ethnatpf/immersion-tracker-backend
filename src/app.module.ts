import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ImmersionSessionsModule } from "./modules/immersion-session/immersion-session.module.js";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigModule } from "@nestjs/config";
import { LanguageModule } from "./modules/language/language.module.js";
import { ContentModule } from "./modules/content/content.module.js";
import { TimerModule } from "./modules/timer/timer.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { UserModule } from "./modules/user/user.module.js";
import { MetricsModule } from "./modules/metrics/metrics.module.js";
import { TelemetryShutdownService } from "./telemetry/telemetry-shutdown.service.js";
import { HealthModule } from "./modules/health/health.module.js";
import { ThrottlerModule } from "@nestjs/throttler";
import { ObservabilityModule } from "./modules/observability/observability.module.js";

@Module({
  imports: [
    ImmersionSessionsModule,
    ConfigModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGODB_URL!),
    HealthModule,
    LanguageModule,
    ContentModule,
    TimerModule,
    DashboardModule,
    UserModule,
    MetricsModule,
    ObservabilityModule,
    ThrottlerModule.forRoot({
      skipIf: () => process.env.NODE_ENV === "test",
      throttlers: [
        {
          ttl: 60000,
          limit: 100,
        },
      ],
    }),
  ],
  controllers: [],
  providers: [
    TelemetryShutdownService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
