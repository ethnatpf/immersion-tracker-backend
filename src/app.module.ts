import { Module } from "@nestjs/common";
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

@Module({
  imports: [
    ImmersionSessionsModule,
    ConfigModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGODB_URL!, {
      dbName: "immersion-tracker",
    }),
    LanguageModule,
    ContentModule,
    TimerModule,
    DashboardModule,
    UserModule,
    MetricsModule,
  ],
  controllers: [],
  providers: [TelemetryShutdownService],
})
export class AppModule {}
