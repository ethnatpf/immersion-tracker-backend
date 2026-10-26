import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, type Types } from "mongoose";
import { Content } from "../content/schemas/content.schema.js";
import type { CreateImmersionSessionDto } from "./dto/create-immersion-session.dto.js";
import type { UpdateImmersionSessionDto } from "./dto/update-immersion-session.dto.js";
import type { SessionHistoryDto } from "./dto/session-history.dto.js";
import { matchesContentTitle } from "../../utils/matches-content-title.js";
import type { SessionHistoryResponseDto } from "./dto/session-history-response.dto.js";
import {
  ImmersionSession,
  type ImmersionSessionDocument,
} from "./schemas/immersion-session.schema.js";

type HistorySession = Pick<
  ImmersionSession,
  "created_at" | "duration" | "progress"
> & {
  _id: Types.ObjectId;
  content: (Pick<Content, "title" | "type"> & { _id: Types.ObjectId }) | null;
};

@Injectable()
export class ImmersionSessionService {
  constructor(
    @InjectModel(ImmersionSession.name)
    private readonly sessionModel: Model<ImmersionSession>,
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
  ) {}

  async remove(id: string, userId: string): Promise<void> {
    const result = await this.sessionModel
      .deleteOne({ _id: id, user_id: userId })
      .exec();
    if (result.deletedCount === 0)
      throw new NotFoundException("Immersion session does not exist");
  }

  async update(
    id: string,
    input: UpdateImmersionSessionDto,
    userId: string,
  ): Promise<ImmersionSessionDocument> {
    const owner = { _id: id, user_id: userId };
    const session = await this.sessionModel.findOne(owner).exec();
    if (!session)
      throw new NotFoundException("Immersion session does not exist");

    const changes: Partial<ImmersionSession> = {};
    if (input.created_at !== undefined)
      changes.created_at = new Date(`${input.created_at}T00:00:00.000Z`);
    if (input.duration !== undefined) changes.duration = input.duration;
    if (input.progress !== undefined) {
      const unit = input.progress.unit ?? session.progress?.unit;
      if (unit === undefined)
        throw new BadRequestException(
          "Progress unit is required when adding progress",
        );
      changes.progress = {
        unit,
        start: input.progress.start,
        end: input.progress.end,
      };
    }

    const updated = await this.sessionModel
      .findOneAndUpdate(
        owner,
        { $set: changes },
        {
          returnDocument: "after",
          runValidators: true,
        },
      )
      .exec();
    if (!updated)
      throw new NotFoundException("Immersion session does not exist");
    return updated;
  }

  async history(
    input: SessionHistoryDto,
    userId: string,
  ): Promise<SessionHistoryResponseDto> {
    const { page = 1, limit = 20 } = input;
    const query = input.q?.trim().toLowerCase() ?? "";
    const dateRange = {
      ...(input.start_date !== undefined
        ? { $gte: new Date(`${input.start_date}T00:00:00.000Z`) }
        : {}),
      ...(input.end_date !== undefined
        ? { $lte: new Date(`${input.end_date}T00:00:00.000Z`) }
        : {}),
    };
    const sessionQuery = this.sessionModel.find({
      user_id: userId,
      ...(Object.keys(dateRange).length ? { created_at: dateRange } : {}),
    });
    if (input.content !== undefined) {
      sessionQuery.where("content").equals(input.content);
    }
    const candidates = await sessionQuery
      .select({ content: 1, created_at: 1, duration: 1, progress: 1 })
      .sort({ created_at: -1, _id: -1 })
      .populate({
        path: "content",
        select: { title: 1, type: 1 },
        match: {
          user_id: userId,
          ...(input.type === undefined
            ? {}
            : {
                type: {
                  $in: Array.isArray(input.type) ? input.type : [input.type],
                },
              }),
        },
      })
      .lean<HistorySession[]>()
      .exec();

    // Match before pagination so totals and pages include only eligible sessions.
    const matches = candidates.filter(
      (
        session,
      ): session is HistorySession & {
        content: NonNullable<HistorySession["content"]>;
      } =>
        session.content !== null &&
        matchesContentTitle(session.content.title, query),
    );
    return {
      items: matches
        .slice((page - 1) * limit, page * limit)
        .map(({ _id, content, created_at, duration, progress }) => ({
          id: _id.toHexString(),
          content_id: content._id.toHexString(),
          title: content.title,
          type: content.type,
          created_at: created_at.toISOString(),
          duration,
          ...(progress === undefined ? {} : { progress }),
        })),
      total: matches.length,
      page,
      limit,
    };
  }

  async create(
    input: CreateImmersionSessionDto,
    userId: string,
  ): Promise<ImmersionSessionDocument> {
    const content = await this.contentModel
      .findOne({ _id: input.content, user_id: userId })
      .select({ language: 1, type: 1 })
      .exec();
    if (!content) throw new BadRequestException("Content does not exist");

    return new this.sessionModel({
      content: input.content,
      language: content.language,
      content_type: content.type,
      duration: input.duration,
      user_id: userId,
      created_at:
        input.created_at === undefined
          ? undefined
          : new Date(`${input.created_at}T00:00:00.000Z`),
      progress: input.progress,
    }).save();
  }
}
