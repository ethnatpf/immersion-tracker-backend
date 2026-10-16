import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
} from "@nestjs/swagger";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { StartTimerDto } from "./dto/start-timer.dto.js";
import { TimerService } from "./timer.service.js";
import {
  CurrentTimerResponseDto,
  TimerResponseDto,
} from "./dto/timer-response.dto.js";
import { ImmersionSessionResponseDto } from "../immersion-session/dto/immersion-session-response.dto.js";
import type { ImmersionSessionDocument } from "../immersion-session/schemas/immersion-session.schema.js";
import type { TimerDocument } from "./schemas/timer.schema.js";

@ApiBearerAuth()
@Controller("timer")
export class TimerController {
  constructor(private readonly timerService: TimerService) {}

  @Get()
  @ApiOkResponse({ type: CurrentTimerResponseDto })
  getCurrent(
    @CurrentUserId() userId: string,
  ): Promise<CurrentTimerResponseDto> {
    return this.timerService.getCurrent(userId);
  }

  @Post("start")
  @ApiCreatedResponse({ type: TimerResponseDto })
  start(
    @Body() input: StartTimerDto,
    @CurrentUserId() userId: string,
  ): Promise<TimerDocument> {
    return this.timerService.start(input, userId);
  }

  @Post("stop")
  @ApiCreatedResponse({ type: ImmersionSessionResponseDto })
  stop(@CurrentUserId() userId: string): Promise<ImmersionSessionDocument> {
    return this.timerService.stop(userId);
  }
}
