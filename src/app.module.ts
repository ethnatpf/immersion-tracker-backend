import { Module } from "@nestjs/common";
import { ImmersionSessionsModule } from "./modules/immersion-session/immersion-session.module.js";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigModule } from "@nestjs/config";
import { LanguageModule } from "./modules/language/language.module.js";
import { ContentModule } from "./modules/content/content.module.js";
import { TimerModule } from "./modules/timer/timer.module.js";

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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
