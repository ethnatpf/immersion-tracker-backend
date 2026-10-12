import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Content, ContentSchema } from "./schemas/content.schema.js";
import { ContentController } from "./content.controller.js";
import { ContentService } from "./content.service.js";
import { LanguageModule } from "../language/language.module.js";

@Module({
  controllers: [ContentController],
  providers: [ContentService],
  imports: [
    LanguageModule,
    MongooseModule.forFeature([
      {
        name: Content.name,
        schema: ContentSchema,
      },
    ]),
  ],
})
export class ContentModule {}
