import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SessionProgressResponseDto {
  @ApiProperty({ enum: ["episode", "page"] })
  unit: "episode" | "page";

  @ApiProperty({ type: "integer", minimum: 1, description: "Inclusive start" })
  start: number;

  @ApiProperty({ type: "integer", minimum: 1, description: "Inclusive end" })
  end: number;
}

export class ImmersionSessionResponseDto {
  @ApiProperty({ description: "Immersion session ID" })
  _id: string;

  @ApiProperty({ description: "Content ID" })
  content: string;

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
