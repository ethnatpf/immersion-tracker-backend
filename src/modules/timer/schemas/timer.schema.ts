import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { Content } from "~/modules/content/schemas/content.schema.js";

@Schema()
export class Timer {
  @Prop({ required: true })
  user_id: string;

  // If the content doesn't exist on timer creation, we should create it first and associate the timer to it
  @Prop({ type: SchemaTypes.ObjectId, ref: "Content", required: true })
  content: Content;

  @Prop({ required: true, default: Date.now })
  started_at: Date;
}

export type TimerDocument = HydratedDocument<Timer>;
export const TimerSchema = SchemaFactory.createForClass(Timer);
