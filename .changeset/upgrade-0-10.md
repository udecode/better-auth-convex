---
"better-auth-convex": minor
---

### @convex-dev/better-auth 0.10

This release updates better-auth-convex to work with `@convex-dev/better-auth@0.10.4` and `better-auth@1.4.7`.

For the upstream migration guide, see: https://labs.convex.dev/better-auth/migrations/migrate-to-0-10

### Breaking Changes

#### `createApi` signature changed

The second parameter is now `createAuth` function instead of spread auth options:

```ts
// Before
export const { create, ... } = createApi(schema, {
  ...auth.options,
  skipValidation: true,
});

// After
export const { create, ... } = createApi(schema, createAuth, {
  skipValidation: true,
});
```

#### `authClient.adapter` signature changed

Now takes `createAuthOptions` function instead of options object:

```ts
// Before
database: authClient.adapter(ctx, auth.options),

// After
database: authClient.adapter(ctx, createAuthOptions),
```

#### `createAuth` pattern replaced

The static `auth` instance with `optionsOnly` is replaced by `createAuthOptions` factory:

```ts
// Before
export const createAuth = (ctx, { optionsOnly } = { optionsOnly: false }) => {
  return betterAuth({ ... });
};
export const auth = createAuth({}, { optionsOnly: true });

// After
export const createAuthOptions = (ctx) => ({
  baseURL: process.env.SITE_URL!,
  plugins: [convex({ authConfig, jwks: process.env.JWKS })],
  // ...
}) satisfies BetterAuthOptions;

export const createAuth = (ctx) => betterAuth(createAuthOptions(ctx));
```

### New Features

#### Static JWKS exports

`createApi` now exports `getLatestJwks` and `rotateKeys` for static JWKS management:

```ts
export const {
  create,
  // ... other exports
  getLatestJwks,
  rotateKeys,
} = createApi(schema, createAuth, { skipValidation: true });
```

After deploying, generate JWKS:

```bash
npx convex run auth:getLatestJwks | npx convex env set JWKS
```

### Migration Steps

1. Update dependencies:

   ```bash
   pnpm add better-auth@1.4.7 @convex-dev/better-auth@0.10.4
   ```

2. Update `convex/auth.config.ts`:

   ```ts
   export default {
     providers: [getAuthConfigProvider({ jwks: process.env.JWKS })],
   } satisfies AuthConfig;
   ```

3. Update `convex/auth.ts`:
   - Replace `auth` static instance with `createAuthOptions` factory
   - Update `createApi` call signature
   - Update `getAuth` to use `createAuthOptions`
   - Add `getLatestJwks` and `rotateKeys` to exports

4. Deploy and generate JWKS:
   ```bash
   npx convex run auth:getLatestJwks | npx convex env set JWKS
   ```

See the [README](https://github.com/udecode/better-auth-convex) for complete setup examples.
