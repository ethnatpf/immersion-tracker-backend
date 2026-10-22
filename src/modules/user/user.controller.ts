import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiBearerAuth, ApiOkResponse } from "@nestjs/swagger";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { UserPreferencesResponseDto } from "./dto/user-preferences-response.dto.js";
import { UserService } from "./user.service.js";

@ApiBearerAuth()
@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("preferences")
  @ApiOperation({ operationId: "userPreferences" })
  @ApiOkResponse({ type: UserPreferencesResponseDto })
  preferences(
    @CurrentUserId() userId: string,
  ): Promise<UserPreferencesResponseDto> {
    return this.userService.preferences(userId);
  }
}
