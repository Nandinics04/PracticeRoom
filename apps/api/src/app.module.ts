import {Module} from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { SignedInGuard } from "./auth/signed-in.guard";
import { USER_REPOSITORY } from "./auth/user-repository";
import { SqliteUserStore } from "./auth/sqlite-user-store";
import {HealthController} from "./health.controller";
import { InterviewsController } from "./interviews.controller";
import { PythonRoom } from "./interviews/python-room";
import { SESSION_REPOSITORY } from "./interviews/session-repository";
import { sqliteFile } from "./interviews/sqlite-data-path";
import { SqliteSessionStore } from "./interviews/sqlite-session-store";

@Module({
    controllers: [HealthController, AuthController, InterviewsController],
    providers: [
        {
            provide: SESSION_REPOSITORY,
            useFactory: () => new SqliteSessionStore(sqliteFile("sessions.sqlite"), sqliteFile("sessions.json")),
        },
        {
            provide: USER_REPOSITORY,
            useFactory: () => new SqliteUserStore(sqliteFile("sessions.sqlite")),
        },
        PythonRoom,
        SignedInGuard,
    ],
})
export class AppModule {}