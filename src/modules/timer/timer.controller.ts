import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { StartTimerDto } from "./dto/start-timer.dto.js";
import { TimerService } from "./timer.service.js";

@ApiBearerAuth()
@Controller("timer")
export class TimerController {
  constructor(private readonly timerService: TimerService) {}

  @Get()
  getCurrent(@CurrentUserId() userId: string) {
    return this.timerService.getCurrent(userId);
  }

  @Post("start")
  start(@Body() input: StartTimerDto, @CurrentUserId() userId: string) {
    return this.timerService.start(input, userId);
  }

  @Post("stop")
  stop(@CurrentUserId() userId: string) {
    return this.timerService.stop(userId);
  }
}
