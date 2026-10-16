import { ApiProperty } from "@nestjs/swagger";
import type { Content } from "../../content/schemas/content.schema.js";

export class TimerResponseDto {
  @ApiProperty({ description: "Timer ID" })
  _id: string;

  @ApiProperty({ description: "Content ID" })
  content: string;

  @ApiProperty({ description: "External authentication provider user ID" })
  user_id: string;

  @ApiProperty({ format: "date-time", description: "Timer start time in UTC" })
  started_at: string;
}

export class CurrentTimerResponseDto {
  @ApiProperty({ description: "Timer ID" })
  id: string;

  @ApiProperty({ description: "Content ID" })
  content_id: string;

  @ApiProperty({ description: "Content title" })
  title: string;

  @ApiProperty({ enum: ["anime", "book", "manga", "drama", "video"] })
  type: Content["type"];

  @ApiProperty({ format: "date-time", description: "Timer start time in UTC" })
  started_at: string;
}
