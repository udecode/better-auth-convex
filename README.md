# Better Auth Convex

Local installation of Better Auth directly in your Convex app schema, with direct database access instead of component-based queries.

## Why Better Auth Convex?

The official `@convex-dev/better-auth` component stores auth tables in a component schema. This package provides an alternative approach with direct schema integration.

**This package provides direct local installation:**

1. **Auth tables live in your app schema** - Not in a component boundary
2. **Direct database access** - No `ctx.runQuery`/`ctx.runMutation` overhead (>50ms latency that increases with app size)
3. **Unified context** - Auth triggers can directly access and modify your app tables transactionally
4. **Full TypeScript inference** - Single schema, single source of truth

> [!WARNING]
> BREAKING CHANGE: Auth tables are stored in your app schema instead of the component schema. If you're already in production with `@convex-dev/better-auth`, you'll need to write a migration script to move your auth data.

## Prerequisites

- Follow the [official Better Auth + Convex setup guide](https://convex-better-auth.netlify.app/) first
- Choose your [framework guide](https://convex-better-auth.netlify.app/framework-guides/next)
  - **IGNORE these steps from the framework guide**:
    - Step 2: "Register the component" - We don't use the component approach
    - Step 5: `convex/auth.ts` - We'll use a different setup
    - Step 7: `convex/http.ts` - We use different route registration
- Then come back here to install locally

## Installation

```bash
pnpm add better-auth@1.3.13 better-auth-convex
```

## Local Setup

You'll need `convex/auth.config.ts` and update your files to install Better Auth directly in your app:

```ts
// convex/auth.ts
import { betterAuth } from 'better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { admin, organization } from 'better-auth/plugins'; // Optional plugins
import {
  type AuthFunctions,
  createClient,
  createApi,
} from 'better-auth-convex';
import { internal } from './_generated/api';
import type { MutationCtx, QueryCtx, GenericCtx } from './_generated/server';
import type { DataModel } from './_generated/dataModel';
import schema from './schema'; // YOUR app schema with auth tables

// 1. Internal API functions for auth operations
const authFunctions: AuthFunctions = internal.auth;

// 2. Auth client with triggers that run in your app context
export const authClient = createClient<DataModel, typeof schema>({
  authFunctions,
  schema,
  triggers: {
    user: {
      onCreate: async (ctx, user) => {
        // Direct access to your database
        // Example: Create personal organization
        const orgId = await ctx.db.insert('organization', {
          name: `${user.name}'s Workspace`,
          slug: `personal-${user._id}`,
          // ... other fields
        });

        // Update user with personalOrganizationId
        await ctx.db.patch(user._id, {
          personalOrganizationId: orgId,
        });
      },
    },
    session: {
      onCreate: async (ctx, session) => {
        // Set default active organization on session creation
        if (!session.activeOrganizationId) {
          const user = await ctx.db.get(session.userId);

          if (user?.personalOrganizationId) {
            await ctx.db.patch(session._id, {
              activeOrganizationId: user.personalOrganizationId,
            });
          }
        }
      },
    },
  },
});

// 3. Create auth configuration (with options for HTTP-only mode)
export const createAuth = (
  ctx: GenericCtx,
  { optionsOnly } = { optionsOnly: false }
) => {
  const baseURL = process.env.NEXT_PUBLIC_SITE_URL!;

  return betterAuth({
    baseURL,
    logger: { disabled: optionsOnly },
    plugins: [
      convex(), // Required
      admin(),
      organization({
        // Organization plugin config
      }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24 * 15, // 15 days
    },
    database: authClient.httpAdapter(ctx),
    // ... other config (social providers, user fields, etc.)
  });
};

// 4. Static auth instance for configuration
export const auth = createAuth({} as any, { optionsOnly: true });

// 5. IMPORTANT: Use getAuth for queries/mutations (direct DB access)
export const getAuth = <Ctx extends QueryCtx | MutationCtx>(ctx: Ctx) => {
  return betterAuth({
    ...auth.options,
    database: authClient.adapter(ctx, auth.options),
  });
};

// 6. Export trigger handlers for Convex
export const { onCreate, onDelete, onUpdate } = authClient.triggersApi();

// 7. Export API functions for internal use
export const {
  create,
  deleteMany,
  deleteOne,
  findMany,
  findOne,
  updateMany,
  updateOne,
} = createApi(schema, auth.options);
```

```ts
// convex/http.ts
import { httpRouter } from 'convex/server';
import { registerRoutes } from 'better-auth-convex';
import { createAuth } from './auth';

const http = httpRouter();

registerRoutes(http, createAuth);

export default http;
```

## Key Concepts

### Direct DB Access vs HTTP Adapter

```ts
// ✅ In queries/mutations: Use getAuth (direct DB access)
export const someQuery = query({
  handler: async (ctx) => {
    const auth = getAuth(ctx); // Direct DB access
    const user = await auth.api.getUser({ userId });
  },
});

// ⚠️ In actions: Use createAuth (needs HTTP adapter for external calls)
export const someAction = action({
  handler: async (ctx) => {
    const auth = createAuth(ctx); // Actions can't directly access DB
    // Use for webhooks, external API calls, etc.
  },
});
```

### Unified Schema Benefits

```ts
// Component approach (@convex-dev/better-auth):
// - Auth tables in components.betterAuth schema
// - Requires ctx.runQuery/runMutation for auth operations
// - Component boundaries between auth and app tables

// Local approach (better-auth-convex):
// ✅ Auth tables in your app schema
// ✅ Direct queries across auth + app tables
// ✅ Single transaction for complex operations
// ✅ Direct function calls
```

### Helper Functions

All helpers are exported from the main package:

```ts
import { getAuthUserId, getSession, getHeaders } from 'better-auth-convex';

// Get current user ID
const userId = await getAuthUserId(ctx);

// Get full session
const session = await getSession(ctx);

// Get headers for auth.api calls
const headers = await getHeaders(ctx);
```

## Updating the Schema

Better Auth configuration changes may require schema updates. The Better Auth docs will often note when this is the case. To regenerate the schema (it's generally safe to do), run:

```bash
cd convex && npx @better-auth/cli generate -y --output authSchema.ts
```

### Import Generated Schema (Recommended)

Import the generated schema in your `convex/schema.ts`:

```ts
import { authSchema } from './authSchema';
import { defineSchema } from 'convex/server';

export default defineSchema({
  ...authSchema,
  // Your other tables here
});
```

### Or Use as Reference

Alternatively, use the generated schema as a reference to manually update your existing schema:

```ts
// Example: Adding a missing field discovered from generated schema
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  user: defineTable({
    // ... existing fields
    twoFactorEnabled: v.optional(v.union(v.null(), v.boolean())), // New field from Better Auth update
    // ... rest of your schema
  }).index('email_name', ['email', 'name']),
  // ... other indexes
});
```

### Adding Custom Indexes

Better Auth may log warnings about missing indexes for certain queries. You can add custom indexes by extending the generated schema:

```ts
// convex/schema.ts
import { authSchema } from './authSchema';
import { defineSchema } from 'convex/server';

export default defineSchema({
  ...authSchema,
  // Override with custom indexes
  user: authSchema.user.index('username', ['username']),
  // Your other tables
});
```

**Note**: `authSchema` table names and field names should not be customized directly. Use Better Auth configuration options to customize the schema, then regenerate to see the expected structure.

## Credits

Built on top of [Better Auth](https://better-auth.com) and [@convex-dev/better-auth](https://github.com/get-convex/better-auth), optimized for [Convex](https://convex.dev).
