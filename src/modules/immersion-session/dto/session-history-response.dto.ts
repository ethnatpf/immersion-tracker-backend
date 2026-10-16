import { ApiProperty } from "@nestjs/swagger";
import type { Content } from "../../content/schemas/content.schema.js";

export class SessionHistoryItemResponseDto {
  @ApiProperty({ description: "Immersion session ID" })
  id: string;

  @ApiProperty({ description: "Content ID" })
  content_id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: ["anime", "book", "manga", "drama", "video"] })
  type: Content["type"];

  @ApiProperty({ format: "date-time", description: "Session date in UTC" })
  created_at: string;

  @ApiProperty({
    type: "integer",
    description: "Duration in seconds",
    minimum: 1,
  })
  duration: number;
}

export class SessionHistoryResponseDto {
  @ApiProperty({ type: [SessionHistoryItemResponseDto] })
  items: SessionHistoryItemResponseDto[];

  @ApiProperty({
    type: "integer",
    description: "Total matching sessions",
    minimum: 0,
  })
  total: number;

  @ApiProperty({ type: "integer", minimum: 1 })
  page: number;

  @ApiProperty({ type: "integer", minimum: 1 })
  limit: number;
}
