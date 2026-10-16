import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { DashboardStatisticsDto } from "./dto/dashboard-statistics.dto.js";
import { DashboardService } from "./dashboard.service.js";

@ApiBearerAuth()
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("statistics")
  statistics(
    @Query() input: DashboardStatisticsDto,
    @CurrentUserId() userId: string,
  ) {
    return this.dashboardService.statistics(input, userId);
  }
}
