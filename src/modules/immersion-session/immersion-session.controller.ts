import { Controller } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";

@ApiBearerAuth()
@Controller("immersion-session")
export class ImmersionSessionController {}
