import type { betterAuth } from 'better-auth';

export type CreateAuth = (ctx: any) => ReturnType<typeof betterAuth>;
