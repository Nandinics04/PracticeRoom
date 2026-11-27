import "reflect-metadata";
import { NestFactory} from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule}  from "./app.module";

async function bootstrap(){
    const app= await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
    app.useBodyParser("json", { limit: "12mb" });
    app.enableCors({origin: "http://localhost:5173", credentials: true});
    app.setGlobalPrefix("api/v1");
    await app.listen(3000);
}
bootstrap();