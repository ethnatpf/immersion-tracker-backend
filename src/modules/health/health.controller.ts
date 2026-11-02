import { Controller, Get } from "@nestjs/common";
import {
  HealthCheckService,
  HttpHealthIndicator,
  HealthCheck,
  MongooseHealthIndicator,
} from "@nestjs/terminus";
import { BACKEND_PORT } from "~/constants.js";
import { DisableUserAuthorization } from "~/guards/authorization.guard.js";

@Controller("health")
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private mongoose: MongooseHealthIndicator,
  ) {}

  @DisableUserAuthorization()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Test the api endpoint to make sure the backend is able to answer requests
      () =>
        this.http.pingCheck("api-http", `http://localhost:${BACKEND_PORT}/api`),
      () => this.mongoose.pingCheck("database"),
    ]);
  }
}
