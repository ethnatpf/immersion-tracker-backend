import { Test, TestingModule } from "@nestjs/testing";
import { ImmersionSessionService } from "./immersion-session.service.js";

describe("ImmersionSessionService", () => {
  let service: ImmersionSessionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImmersionSessionService],
    }).compile();

    service = module.get<ImmersionSessionService>(ImmersionSessionService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
