import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Content, ContentSchema } from "../content/schemas/content.schema.js";
import { Timer, TimerSchema } from "./schemas/timer.schema.js";
import { TimerController } from "./timer.controller.js";
import { TimerService } from "./timer.service.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Timer.name, schema: TimerSchema },
      { name: Content.name, schema: ContentSchema },
    ]),
  ],
  controllers: [TimerController],
  providers: [TimerService],
})
export class TimerModule {}
