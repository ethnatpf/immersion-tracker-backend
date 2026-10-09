import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Content, ContentSchema } from "./schemas/content.schema.js";
import { ContentController } from "./content.controller.js";

@Module({
  controllers: [ContentController],
  imports: [
    MongooseModule.forFeature([
      {
        name: Content.name,
        schema: ContentSchema,
      },
    ]),
  ],
})
export class ContentModule {}
