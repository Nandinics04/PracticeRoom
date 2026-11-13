import {Module} from "@nestjs/common";
import {HealthController} from "./health.controller";
import { InterviewsController } from "./interviews.controller";
import { SessionStore } from "./interviews/session-store";

@Module({
    controllers: [HealthController, InterviewsController],
    providers: [SessionStore],
})
export class AppModule {}