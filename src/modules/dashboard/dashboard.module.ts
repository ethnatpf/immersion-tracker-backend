import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  ImmersionSession,
  ImmersionSessionSchema,
} from "../immersion-session/schemas/immersion-session.schema.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImmersionSession.name, schema: ImmersionSessionSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
