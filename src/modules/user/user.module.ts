import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Content, ContentSchema } from "../content/schemas/content.schema.js";
import {
  ImmersionSession,
  ImmersionSessionSchema,
} from "../immersion-session/schemas/immersion-session.schema.js";
import { UserController } from "./user.controller.js";
import { UserService } from "./user.service.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Content.name, schema: ContentSchema },
      { name: ImmersionSession.name, schema: ImmersionSessionSchema },
    ]),
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
