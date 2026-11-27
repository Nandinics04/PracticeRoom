import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Patch, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { ExperienceLevel, PracticeAccount, PracticeGoal } from "@practice-room/shared-types";
import { SESSION_REPOSITORY, type SessionRepository } from "../interviews/session-repository";
import { clearedSessionCookie, readCookie, SESSION_COOKIE, sessionCookie, type SignedRequest } from "./signed-in.guard";
import { EmailAlreadyUsed, USER_REPOSITORY, type UserRepository } from "./user-repository";

const LEVELS = new Set<ExperienceLevel>(["entry", "mid", "senior"]);
const GOALS = new Set<PracticeGoal>(["this_week", "campus", "practice"]);

type CookieResponse = { setHeader(name: string, value: string): void };

@Controller("auth")
export class AuthController {
    constructor(
        @Inject(USER_REPOSITORY) private readonly users: UserRepository,
        @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    ) {}

    @Post("signup")
    signup(@Body() body: { name?: string; email?: string; password?: string }, @Res({ passthrough: true }) response: CookieResponse): PracticeAccount {
        const name = body.name?.trim() ?? "";
        const email = body.email?.trim() ?? "";
        const password = body.password ?? "";
        if (name.length < 2 || !email.includes("@") || password.length < 8) {
            throw new BadRequestException("Use your name, a real email, and a password of at least 8 characters.");
        }
        const firstAccount = this.users.count() === 0;
        let account: PracticeAccount;
        try {
            account = this.users.create({ name, email, password });
        } catch (error) {
            if (error instanceof EmailAlreadyUsed) {
                throw new ConflictException(error.message);
            }
            throw error;
        }
        if (firstAccount) {
            this.sessions.claimUnowned(account.id);
        }
        response.setHeader("Set-Cookie", sessionCookie(this.users.openSession(account.id)));
        return account;
    }

    @Post("login")
    login(@Body() body: { email?: string; password?: string }, @Res({ passthrough: true }) response: CookieResponse): PracticeAccount {
        const session = this.users.authenticate(body.email ?? "", body.password ?? "");
        if (!session) {
            throw new UnauthorizedException("Email or password is wrong.");
        }
        response.setHeader("Set-Cookie", sessionCookie(session.token));
        return session.account;
    }

    @Post("logout")
    logout(@Req() request: SignedRequest, @Res({ passthrough: true }) response: CookieResponse) {
        const token = readCookie(request.headers.cookie, SESSION_COOKIE);
        if (token) {
            this.users.revoke(token);
        }
        response.setHeader("Set-Cookie", clearedSessionCookie());
        return { ok: true };
    }

    @Get("me")
    me(@Req() request: SignedRequest): PracticeAccount {
        const account = this.users.findByToken(readCookie(request.headers.cookie, SESSION_COOKIE));
        if (!account) {
            throw new UnauthorizedException("Sign in to continue.");
        }
        return account;
    }

    @Patch("profile")
    profile(@Req() request: SignedRequest, @Body() body: { targetRole?: string; experienceLevel?: string; goal?: string }): PracticeAccount {
        const account = this.users.findByToken(readCookie(request.headers.cookie, SESSION_COOKIE));
        if (!account) {
            throw new UnauthorizedException("Sign in to continue.");
        }
        const targetRole = body.targetRole?.trim() ?? "";
        const experienceLevel = body.experienceLevel ?? "";
        const goal = body.goal ?? "";
        if (targetRole.length < 2 || !LEVELS.has(experienceLevel as ExperienceLevel) || !GOALS.has(goal as PracticeGoal)) {
            throw new BadRequestException("Say the role, your experience, and whether this is for an interview this week, campus placements, or general practice.");
        }
        return this.users.saveProfile(account.id, {
            targetRole,
            experienceLevel: experienceLevel as ExperienceLevel,
            goal: goal as PracticeGoal,
        });
    }
}
