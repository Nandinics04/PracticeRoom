import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { PracticeAccount } from "@practice-room/shared-types";
import { USER_REPOSITORY, type UserRepository } from "./user-repository";

export const SESSION_COOKIE = "practice_room";

export type SignedRequest = {
    headers: { cookie?: string };
    user: PracticeAccount;
};

@Injectable()
export class SignedInGuard implements CanActivate {
    constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<SignedRequest>();
        const token = readCookie(request.headers.cookie, SESSION_COOKIE);
        const account = token ? this.users.findByToken(token) : null;
        if (!account) {
            throw new UnauthorizedException("Sign in to continue.");
        }
        request.user = account;
        return true;
    }
}

export function readCookie(header: string | undefined, name: string): string {
    if (!header) {
        return "";
    }
    const found = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}

export function sessionCookie(token: string): string {
    const maxAge = 14 * 24 * 60 * 60;
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function clearedSessionCookie(): string {
    return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}
