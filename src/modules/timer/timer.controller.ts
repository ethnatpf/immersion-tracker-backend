import { Body, Controller, Post } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { StartTimerDto } from "./dto/start-timer.dto.js";
import { TimerService } from "./timer.service.js";

@ApiBearerAuth()
@Controller("timer")
export class TimerController {
  constructor(private readonly timerService: TimerService) {}

  @Post("start")
  start(@Body() input: StartTimerDto, @CurrentUserId() userId: string) {
    return this.timerService.start(input, userId);
  }
}
