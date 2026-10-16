import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { Content } from "~/modules/content/schemas/content.schema.js";

@Schema({ _id: false })
export class SessionProgress {
  @Prop({ type: String, enum: ["episode", "page"], required: true })
  unit: "episode" | "page";

  // Inclusive endpoints; a single episode or page has equal start and end.
  @Prop({
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: "start must be an integer",
    },
  })
  start: number;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    validate: [
      { validator: Number.isInteger, message: "end must be an integer" },
      {
        validator: function (this: SessionProgress, value: number) {
          return value >= this.start;
        },
        message: "end must be greater than or equal to start",
      },
    ],
  })
  end: number;
}

export const SessionProgressSchema =
  SchemaFactory.createForClass(SessionProgress);

@Schema({ toJSON: { versionKey: false } })
export class ImmersionSession {
  // Duration in seconds
  @Prop({ required: true })
  duration: number;

  // ID of the user inside the external authentication provider (Auth0)
  @Prop({ required: true, index: true })
  user_id: string;

  @Prop({
    required: true,
    type: SchemaTypes.Date,
    default: () => {
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      return day;
    },
    index: true,
  })
  created_at: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Content", required: true })
  content: Content;

  @Prop({ type: SessionProgressSchema })
  progress?: SessionProgress;
}

export type ImmersionSessionDocument = HydratedDocument<ImmersionSession>;
export const ImmersionSessionSchema =
  SchemaFactory.createForClass(ImmersionSession);
