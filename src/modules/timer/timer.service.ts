import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, mongo } from "mongoose";
import { Content } from "../content/schemas/content.schema.js";
import {
  ImmersionSession,
  type ImmersionSessionDocument,
} from "../immersion-session/schemas/immersion-session.schema.js";
import type { StartTimerDto } from "./dto/start-timer.dto.js";
import { Timer, type TimerDocument } from "./schemas/timer.schema.js";

@Injectable()
export class TimerService {
  constructor(
    @InjectModel(Timer.name) private readonly timerModel: Model<Timer>,
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
    @InjectModel(ImmersionSession.name)
    private readonly sessionModel: Model<ImmersionSession>,
  ) {}

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
