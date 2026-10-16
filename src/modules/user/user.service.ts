import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, type Types } from "mongoose";
import { Content } from "../content/schemas/content.schema.js";
import { ImmersionSession } from "../immersion-session/schemas/immersion-session.schema.js";
import type { UserPreferencesResponseDto } from "./dto/user-preferences-response.dto.js";

@Injectable()
export class UserService {
  constructor(
    @InjectModel(ImmersionSession.name)
    private readonly sessionModel: Model<ImmersionSession>,
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
  ) {}

  async preferences(userId: string): Promise<UserPreferencesResponseDto> {
    const [preferred] = await this.sessionModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { user_id: userId } },
        {
          $lookup: {
            from: this.contentModel.collection.name,
            localField: "content",
            foreignField: "_id",
            pipeline: [{ $project: { language: 1 } }],
            as: "content",
          },
        },
        { $unwind: "$content" },
        { $group: { _id: "$content.language", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 1 },
      ])
      .exec();

    return { preferred_language: preferred?._id.toHexString() ?? null };
  }
}
