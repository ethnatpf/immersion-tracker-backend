import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure-app.js";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { configureDayjs } from "./configure-dayjs.js";
import { requestLogger } from "./logging/request-logger.js";

configureDayjs();

async function bootstrap() {
  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL environment variable is required");
  }

  const app = await NestFactory.create(AppModule, {
    routeConflictPolicy: {
      duplicate: "error",
      shadow: "warn",
    },
    logger: requestLogger,
  });

  configureApp(app);
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle("Immersion tracker API")
    .setDescription("API for the immersion tracker website")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, documentFactory);

  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
