import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Content } from "../content/schemas/content.schema.js";
import type { CreateImmersionSessionDto } from "./dto/create-immersion-session.dto.js";
import {
  ImmersionSession,
  type ImmersionSessionDocument,
} from "./schemas/immersion-session.schema.js";

@Injectable()
export class ImmersionSessionService {
  constructor(
    @InjectModel(ImmersionSession.name)
    private readonly sessionModel: Model<ImmersionSession>,
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
  ) {}

  async create(
    input: CreateImmersionSessionDto,
    userId: string,
  ): Promise<ImmersionSessionDocument> {
    const content = await this.contentModel
      .exists({ _id: input.content, user_id: userId })
      .exec();
    if (!content) throw new BadRequestException("Content does not exist");

    return new this.sessionModel({
      content: input.content,
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
