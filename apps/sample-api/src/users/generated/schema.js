// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATED — DO NOT EDIT
// Re-run `npm run generate:crud` to regenerate this file.
// Source table: users
// ─────────────────────────────────────────────────────────────────────────────
import { z } from 'zod';

// Insert body — fields accepted on POST /users
export const UsersBodySchema = z
  .object({
    roles: z.string().nullish(),
    tenant_id: z.preprocess(v => v === '' ? undefined : Number(v), z.number().int().nullish()),
    username: z.string().nullish(),
    email: z.string(),
    githubId: z.preprocess(v => v === '' ? undefined : Number(v), z.number().int().nullish()),
    role: z.string().nullish(),
    pnToken: z.string().nullish(),
    sms: z.string().nullish(),
    telegramId: z.string().nullish(),
    telegramUsername: z.string().nullish(),
  })
  .meta({ id: 'UsersBody' });

// Partial update — all fields optional for PATCH /users/:id
export const UsersUpdateSchema = UsersBodySchema.partial().meta({ id: 'UsersUpdate' });

// URL params — :id on /:id routes
export const UsersParamsSchema = z
  .object({
    id: z.coerce.number().int().positive().meta({ example: 1 }),
  })
  .meta({ id: 'UsersParams' });

// Query params — pagination for GET /users
export const UsersQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(25).meta({ example: 25 }),
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
  })
  .passthrough()
  .meta({ id: 'UsersQuery' });

// Full row as returned by SELECT — columns in excludeFromResponse are omitted
export const UsersResponseSchema = z
  .object({
    id: z.number().int().positive(),
    roles: z.string().nullable(),
    tenant_id: z.number().int().nullable(),
    username: z.string().nullable(),
    email: z.string(),
    githubId: z.number().int().nullable(),
    role: z.string().nullable(),
    retryLimit: z.number().int().nullable(),
    retryCount: z.number().int().nullable(),
    retryReset: z.number().int().nullable(),
    pnToken: z.string().nullable(),
    revoked: z.string().nullable(),
    sms: z.string().nullable(),
    smsLastSent: z.string().nullable(),
    smsVerified: z.number().int().nullable(),
    telegramId: z.string().nullable(),
    telegramUsername: z.string().nullable(),
  })
  .meta({ id: 'UsersResponse' });
