import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, mongo, type Types, type ClientSession } from "mongoose";
import { Content } from "./schemas/content.schema.js";
import type { ContentDocument } from "./schemas/content.schema.js";
import type { CreateContentDto } from "./dto/create-content.dto.js";
import type { UpdateContentDto } from "./dto/update-content.dto.js";
import type { SearchContentDto } from "./dto/search-content.dto.js";
import { Language } from "../language/schemas/language.schema.js";
import { matchesContentTitle } from "../../utils/matches-content-title.js";
import type { ContentSearchResponseDto } from "./dto/content-search-response.dto.js";
import type { ContentDetailsResponseDto } from "./dto/content-details-response.dto.js";
import { ImmersionSession } from "../immersion-session/schemas/immersion-session.schema.js";

@Injectable()
export class ContentService {
  constructor(
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
    @InjectModel(Language.name) private readonly languageModel: Model<Language>,
    @InjectModel(ImmersionSession.name)
    private readonly immersionSessionModel: Model<ImmersionSession>,
  ) {}

  async getById(
    id: string,
    userId: string,
  ): Promise<ContentDetailsResponseDto> {
    const content = await this.contentModel
      .findOne({ _id: id, user_id: userId })
      .select({ title: 1, type: 1, completed: 1 })
      .lean()
      .exec();
    if (!content) throw new NotFoundException("Content not found");

    const [summary] = await this.immersionSessionModel
      .aggregate<{
        totalTimeSpent: number;
        lastImmersionSession: Pick<
          ImmersionSession,
          "created_at" | "duration" | "progress"
        > & { _id: Types.ObjectId };
      }>([
        { $match: { content: content._id, user_id: userId } },
        { $sort: { created_at: -1, "progress.end": -1, _id: -1 } },
        {
          $group: {
            _id: null,
            totalTimeSpent: { $sum: "$duration" },
            lastImmersionSession: { $first: "$$ROOT" },
          },
        },
      ])
      .exec();
    const last = summary?.lastImmersionSession;

    return {
      id: content._id.toHexString(),
      title: content.title,
      type: content.type,
      completed: content.completed,
      totalTimeSpent: summary?.totalTimeSpent ?? 0,
      lastImmersionSession: last
        ? {
            id: last._id.toHexString(),
            created_at: last.created_at.toISOString(),
            duration: last.duration,
            ...(last.progress ? { progress: last.progress } : {}),
          }
        : null,
    };
  }

  async search(
    input: SearchContentDto,
    userId: string,
  ): Promise<ContentSearchResponseDto> {
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

  async update(
    id: string,
    input: UpdateContentDto,
    userId: string,
  ): Promise<ContentDocument> {
    if (input.language !== undefined) {
      const language = await this.languageModel
        .exists({ _id: input.language })
        .exec();
      if (!language) throw new BadRequestException("Language does not exist");
    }

    const changes: UpdateContentDto = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.completed !== undefined) changes.completed = input.completed;
    if (input.language !== undefined) changes.language = input.language;

    try {
      const update = async (session?: ClientSession) => {
        const content = await this.contentModel
          .findOneAndUpdate(
            { _id: id, user_id: userId },
            { $set: changes },
            {
              returnDocument: "after",
              runValidators: true,
              ...(session ? { session } : {}),
            },
          )
          .exec();
        if (!content) throw new NotFoundException("Content not found");
        if (input.language !== undefined) {
          await this.immersionSessionModel
            .updateMany(
              { user_id: userId },
              { $set: { language: content.language } },
              { session, runValidators: true },
            )
            .where("content")
            .equals(content._id)
            .exec();
        }
        return content;
      };
      return input.language === undefined
        ? await update()
        : await this.contentModel.db.transaction(update);
    } catch (error) {
      if (error instanceof mongo.MongoServerError && error.code === 11000) {
        throw new ConflictException(
          "You already have content with this title and type",
        );
      }
      throw error;
    }
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
