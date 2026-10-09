import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { Content } from "~/modules/content/schemas/content.schema.js";

@Schema()
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
    default: Date.now,
    index: true,
  })
  created_at: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Content", required: true })
  content: Content;
}

export type ImmersionSessionDocument = HydratedDocument<ImmersionSession>;
export const ImmersionSessionSchema =
  SchemaFactory.createForClass(ImmersionSession);
