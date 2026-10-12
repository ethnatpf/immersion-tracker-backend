import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Content } from "./schemas/content.schema.js";
import type { ContentDocument } from "./schemas/content.schema.js";
import type { CreateContentDto } from "./dto/create-content.dto.js";
import { Language } from "../language/schemas/language.schema.js";

@Injectable()
export class ContentService {
  constructor(
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
    @InjectModel(Language.name) private readonly languageModel: Model<Language>,
  ) {}

  async create(
    input: CreateContentDto,
    userId: string,
  ): Promise<ContentDocument> {
    const language = await this.languageModel
      .exists({ _id: input.language })
      .exec();
    if (!language) {
      throw new BadRequestException("Language does not exist");
    }

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
