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

function cookieFlags(): string {
    // Same-origin nginx proxy: Lax + Secure on HTTPS. Use SameSite=None only if UI and API are on different sites.
    const secure =
        process.env.COOKIE_SECURE === "true"
        || process.env.NODE_ENV === "production";
    if (process.env.COOKIE_SAMESITE === "none") {
        return "HttpOnly; Path=/; SameSite=None; Secure";
    }
    return secure
        ? "HttpOnly; Path=/; SameSite=Lax; Secure"
        : "HttpOnly; Path=/; SameSite=Lax";
}

export function sessionCookie(token: string): string {
    const maxAge = 14 * 24 * 60 * 60;
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieFlags()}; Max-Age=${maxAge}`;
}

export function clearedSessionCookie(): string {
    return `${SESSION_COOKIE}=; ${cookieFlags()}; Max-Age=0`;
}
