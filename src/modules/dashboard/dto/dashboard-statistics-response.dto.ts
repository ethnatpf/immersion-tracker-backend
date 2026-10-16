import { ApiProperty } from "@nestjs/swagger";

export class DashboardBucketResponseDto {
  @ApiProperty({
    description: "Bucket start date in UTC",
    format: "date",
    example: "2026-10-12",
  })
  start_date: string;

  @ApiProperty({ description: "Reading duration in seconds" })
  reading_time: number;

  @ApiProperty({ description: "Audiovisual duration in seconds" })
  audiovisual_time: number;
}

export class DashboardStatisticsResponseDto {
  @ApiProperty({ description: "Total immersion duration in seconds" })
  total_immersion_time: number;

  @ApiProperty({ type: "integer", description: "Current streak in days" })
  current_streak: number;

  @ApiProperty({ description: "Reading duration in seconds" })
  reading_time: number;

  @ApiProperty({ description: "Audiovisual duration in seconds" })
  audiovisual_time: number;

  @ApiProperty({ description: "Daily average immersion duration in seconds" })
  average_time: number;

  @ApiProperty({ type: [DashboardBucketResponseDto] })
  breakdown: DashboardBucketResponseDto[];
}
