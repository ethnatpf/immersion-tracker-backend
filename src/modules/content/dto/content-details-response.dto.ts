import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SessionProgressResponseDto } from "../../immersion-session/dto/immersion-session-response.dto.js";
import { ContentSearchItemResponseDto } from "./content-search-response.dto.js";

export class ContentLastImmersionSessionResponseDto {
  @ApiProperty({ description: "Immersion session ID" })
  id: string;

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

export class ContentDetailsResponseDto extends ContentSearchItemResponseDto {
  @ApiProperty()
  completed: boolean;

  @ApiProperty({ description: "Total immersion duration in seconds" })
  totalTimeSpent: number;

  @ApiProperty({ type: ContentLastImmersionSessionResponseDto, nullable: true })
  lastImmersionSession: ContentLastImmersionSessionResponseDto | null;
}
