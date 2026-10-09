import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Language, LanguageSchema } from "./schemas/language.schema.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Language.name,
        schema: LanguageSchema,
      },
    ]),
  ],
})
export class LanguageModule {}
