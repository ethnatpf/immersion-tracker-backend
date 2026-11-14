import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CONTENT_TYPES } from "../../content/schemas/content.schema.js";
import { SESSION_PROGRESS_UNITS } from "../schemas/immersion-session.schema.js";

export class SessionProgressResponseDto {
  @ApiProperty({ enum: SESSION_PROGRESS_UNITS })
  unit: (typeof SESSION_PROGRESS_UNITS)[number];

  @ApiProperty({ type: "integer", minimum: 1, description: "Inclusive start" })
  start: number;

  @ApiProperty({ type: "integer", minimum: 1, description: "Inclusive end" })
  end: number;

  @ApiPropertyOptional({
    description: "Whether the session duration was automatically calculated from this progress",
  })
  auto?: boolean;
}

export class ImmersionSessionResponseDto {
  @ApiProperty({ description: "Immersion session ID" })
  _id: string;

  @ApiProperty({ description: "Content ID" })
  content: string;

  @ApiProperty({ description: "Language ID" })
  language: string;

  @ApiProperty({ enum: CONTENT_TYPES })
  content_type: (typeof CONTENT_TYPES)[number];

  @ApiProperty({ description: "External authentication provider user ID" })
  user_id: string;

  @ApiProperty({ format: "date-time", description: "Session date in UTC" })
  created_at: string;

  @ApiProperty({
    type: "integer",
    description: "Duration in seconds",
    minimum: 1,
  })
  duration: number;

  @ApiPropertyOptional({ type: SessionProgressResponseDto })
  progress?: SessionProgressResponseDto;
}
