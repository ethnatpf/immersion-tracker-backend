import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL environment variable is required");
  }

  const app = await NestFactory.create(AppModule, {
    routeConflictPolicy: {
      duplicate: "error",
      shadow: "warn",
    },
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
