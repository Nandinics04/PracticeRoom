import { Controller, Get } from "@nestjs/common";
import type { ExperienceLevel} from "@practice-room/shared-types";

const levels: ExperienceLevel[] = ["entry", "mid", "senior"];

@Controller("health")
export class HealthController{
    @Get()
    check(){
        return { status: "ok", experienceLevels: levels };
    }
}