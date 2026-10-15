import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, mongo, type Types } from "mongoose";
import { Content } from "./schemas/content.schema.js";
import type { ContentDocument } from "./schemas/content.schema.js";
import type { CreateContentDto } from "./dto/create-content.dto.js";
import type { SearchContentDto } from "./dto/search-content.dto.js";
import { Language } from "../language/schemas/language.schema.js";
import { matchesContentTitle } from "../../utils/matches-content-title.js";
import type { ContentSearchResult } from "./interfaces/content-search.interface.js";

@Injectable()
export class ContentService {
  constructor(
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
    @InjectModel(Language.name) private readonly languageModel: Model<Language>,
  ) {}

  async search(
    input: SearchContentDto,
    userId: string,
  ): Promise<ContentSearchResult> {
    const { page = 1, limit = 20 } = input;
    const query = input.q?.trim().toLowerCase() ?? "";
    const contentQuery = this.contentModel.find({
      user_id: userId,
      ...(input.type !== undefined ? { type: input.type } : {}),
    });
    if (input.language !== undefined) {
      contentQuery.where("language").equals(input.language);
    }
    const candidates = await contentQuery
      .select({ title: 1, type: 1, _id: 1 })
      .lean<(Pick<Content, "title" | "type"> & { _id: Types.ObjectId })[]>()
      .exec();

    const matches = candidates.filter(({ title }) =>
      matchesContentTitle(title, query),
    );
    matches.sort(
      (first, second) =>
        first.title
          .toLowerCase()
          .localeCompare(second.title.toLowerCase(), "en") ||
        first.type.localeCompare(second.type, "en"),
    );

    return {
      items: matches
        .slice((page - 1) * limit, page * limit)
        .map(({ _id, title, type }) => ({
          id: _id.toHexString(),
          title,
          type,
        })),
      total: matches.length,
      page,
      limit,
    };
  }

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

    try {
      return await new this.contentModel({
        title: input.title,
        type: input.type,
        language: input.language,
        url: input.url,
        user_id: userId,
        completed: false,
      }).save();
    } catch (error) {
      if (error instanceof mongo.MongoServerError && error.code === 11000) {
        throw new ConflictException(
          "You already have content with this title and type",
        );
      }
      throw error;
    }
  }
}
