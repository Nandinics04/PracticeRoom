import type { PracticeAccount } from "@practice-room/shared-types";

export type NewAccount = {
    name: string;
    email: string;
    password: string;
};

export type AccountProfile = Pick<PracticeAccount, "targetRole" | "experienceLevel" | "goal">;

export interface UserRepository {
    count(): number;
    create(input: NewAccount): PracticeAccount;
    authenticate(email: string, password: string): { account: PracticeAccount; token: string } | null;
    openSession(userId: string): string;
    findByToken(token: string): PracticeAccount | null;
    revoke(token: string): void;
    saveProfile(id: string, profile: AccountProfile): PracticeAccount;
}

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");

export class EmailAlreadyUsed extends Error {
    constructor() {
        super("An account with that email already exists.");
    }
}
