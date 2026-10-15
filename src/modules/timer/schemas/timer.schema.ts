import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { Content } from "~/modules/content/schemas/content.schema.js";

@Schema()
export class Timer {
  @Prop({ required: true })
  user_id: string;

  // Timers must reference existing content owned by the user.
  @Prop({ type: SchemaTypes.ObjectId, ref: "Content", required: true })
  content: Content;

  @Prop({ required: true, default: () => new Date() })
  started_at: Date;
}

export type TimerDocument = HydratedDocument<Timer>;
export const TimerSchema = SchemaFactory.createForClass(Timer);
TimerSchema.index({ user_id: 1 }, { unique: true });
