import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, type Types } from "mongoose";
import { ImmersionSession } from "../immersion-session/schemas/immersion-session.schema.js";
import type { UserPreferencesResponseDto } from "./dto/user-preferences-response.dto.js";

@Injectable()
export class UserService {
  constructor(
    @InjectModel(ImmersionSession.name)
    private readonly sessionModel: Model<ImmersionSession>,
  ) {}

  async preferences(userId: string): Promise<UserPreferencesResponseDto> {
    const [preferred] = await this.sessionModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { user_id: userId } },
        { $group: { _id: "$language", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 1 },
      ])
      .exec();

    return { preferred_language: preferred?._id.toHexString() ?? null };
  }
}
