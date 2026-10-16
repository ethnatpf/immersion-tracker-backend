import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, mongo, type Types } from "mongoose";
import { Content } from "../content/schemas/content.schema.js";
import {
  ImmersionSession,
  type ImmersionSessionDocument,
} from "../immersion-session/schemas/immersion-session.schema.js";
import type { StartTimerDto } from "./dto/start-timer.dto.js";
import { Timer, type TimerDocument } from "./schemas/timer.schema.js";
import type { CurrentTimerResponseDto } from "./dto/timer-response.dto.js";

@Injectable()
export class TimerService {
  constructor(
    @InjectModel(Timer.name) private readonly timerModel: Model<Timer>,
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
    @InjectModel(ImmersionSession.name)
    private readonly sessionModel: Model<ImmersionSession>,
  ) {}

  async getCurrent(userId: string): Promise<CurrentTimerResponseDto> {
    const timer = await this.timerModel
      .findOne({ user_id: userId })
      .select({ content: 1, started_at: 1 })
      .populate<{
        content:
          (Pick<Content, "title" | "type"> & { _id: Types.ObjectId }) | null;
      }>({
        path: "content",
        select: { title: 1, type: 1 },
        match: { user_id: userId },
      })
      .lean()
      .exec();
    if (!timer || !timer.content)
      throw new NotFoundException("No active timer");

    return {
      id: timer._id.toHexString(),
      content_id: timer.content._id.toHexString(),
      title: timer.content.title,
      type: timer.content.type,
      started_at: timer.started_at.toISOString(),
    };
  }

  async stop(userId: string): Promise<ImmersionSessionDocument> {
    return this.timerModel.db.transaction(async (session) => {
      const timer = await this.timerModel
        .findOneAndDelete({ user_id: userId }, { session })
        .exec();
      if (!timer) throw new NotFoundException("No active timer");

      return new this.sessionModel({
        content: timer.content,
        user_id: userId,
        duration: Math.floor((Date.now() - timer.started_at.getTime()) / 1000),
      }).save({ session });
    });
  }

  async start(input: StartTimerDto, userId: string): Promise<TimerDocument> {
    const content = await this.contentModel
      .exists({ _id: input.content, user_id: userId })
      .exec();
    if (!content) throw new BadRequestException("Content does not exist");

    const runningTimer = await this.timerModel
      .exists({ user_id: userId })
      .exec();
    if (runningTimer) throw new ConflictException("A timer is already running");

    try {
      return await new this.timerModel({
        content: input.content,
        user_id: userId,
      }).save();
    } catch (error) {
      // The unique owner index also protects simultaneous start requests.
      if (error instanceof mongo.MongoServerError && error.code === 11000)
        throw new ConflictException("A timer is already running");
      throw error;
    }
  }
}
