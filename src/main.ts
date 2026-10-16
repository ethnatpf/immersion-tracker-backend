import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure-app.js";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { configureDayjs } from "./configure-dayjs.js";

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
  });

  const config = new DocumentBuilder()
    .setTitle("Immersion tracker API")
    .setDescription("API for the immersion tracker website")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, documentFactory);

  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
