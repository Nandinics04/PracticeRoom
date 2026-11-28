import "reflect-metadata";
import { NestFactory} from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule}  from "./app.module";

async function bootstrap(){
    const app= await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
    app.useBodyParser("json", { limit: "12mb" });
    const origins = (process.env.CORS_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    app.enableCors({
        origin: origins.length === 1 ? origins[0] : origins,
        credentials: true,
    });
    app.setGlobalPrefix("api/v1");
    const port = Number(process.env.PORT || 3000);
    await app.listen(port, "0.0.0.0");
}
bootstrap();