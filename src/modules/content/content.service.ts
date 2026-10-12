import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Content } from "./schemas/content.schema.js";
import type { ContentDocument } from "./schemas/content.schema.js";
import type { CreateContentDto } from "./dto/create-content.dto.js";

@Injectable()
export class ContentService {
  constructor(
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
  ) {}

  create(input: CreateContentDto, userId: string): Promise<ContentDocument> {
    return new this.contentModel({
      title: input.title,
      type: input.type,
      language: input.language,
      url: input.url,
      user_id: userId,
      completed: false,
    }).save();
  }
}
