import { Module } from "@nestjs/common";
import { ImmersionSessionController } from "./immersion-session.controller.js";
import { ImmersionSessionService } from "./immersion-session.service.js";
import { MongooseModule } from "@nestjs/mongoose";
import {
  ImmersionSession,
  ImmersionSessionSchema,
} from "./schemas/immersion-session.schema.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImmersionSession.name, schema: ImmersionSessionSchema },
    ]),
  ],
  controllers: [ImmersionSessionController],
  providers: [ImmersionSessionService],
  // If another module would need the immersion session service, we could export it here instead of registering it again in the providers.
  // This would allow to share the same instance instead of creating a new one.
  exports: [],
})
export class ImmersionSessionsModule {}
