import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Language, LanguageSchema } from "./schemas/language.schema.js";
import { LanguageController } from "./language.controller.js";
import { LanguageService } from "./language.service.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Language.name,
        schema: LanguageSchema,
      },
    ]),
  ],
  exports: [MongooseModule],
  controllers: [LanguageController],
  providers: [LanguageService],
})
export class LanguageModule {}
