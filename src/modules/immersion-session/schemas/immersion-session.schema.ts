import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import {
  CONTENT_TYPES,
  type Content,
} from "~/modules/content/schemas/content.schema.js";

export const SESSION_PROGRESS_UNITS = ["episode", "page", "chapter"] as const;

@Schema({ _id: false })
export class SessionProgress {
  @Prop({ type: String, enum: SESSION_PROGRESS_UNITS, required: true })
  unit: (typeof SESSION_PROGRESS_UNITS)[number];

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
    default: () => new Date(),
    index: true,
  })
  created_at: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Content", required: true })
  content: Content;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Language", required: true })
  language: Types.ObjectId;

  @Prop({
    type: String,
    enum: CONTENT_TYPES,
    required: true,
  })
  content_type: Content["type"];

  @Prop({ type: SessionProgressSchema })
  progress?: SessionProgress;
}

export type ImmersionSessionDocument = HydratedDocument<ImmersionSession>;
export const ImmersionSessionSchema =
  SchemaFactory.createForClass(ImmersionSession);

ImmersionSessionSchema.index({ user_id: 1, language: 1, created_at: 1 });
