# better-auth-convex

## 0.4.9

### Patch Changes

- [#28](https://github.com/udecode/better-auth-convex/pull/28) [`8b845a2`](https://github.com/udecode/better-auth-convex/commit/8b845a2eec0eea03f66d76428e41d18e086775ee) Thanks [@zbeyens](https://github.com/zbeyens)! - Add `skipValidation` option to `createApi` for smaller generated types. When enabled, uses generic `v.any()` validators instead of typed validators. Since these are internal functions, validation is optional and this can significantly reduce bundle size.

## 0.4.8

### Patch Changes

- [`47bac5c`](https://github.com/udecode/better-auth-convex/commit/47bac5cc353d507ec7ca9db34293d817411b35ab) Thanks [@zbeyens](https://github.com/zbeyens)! - `@convex-dev/better-auth@0.9.11`

## 0.4.7

### Patch Changes

- [`f522483`](https://github.com/udecode/better-auth-convex/commit/f5224839610d671d1dd9b92068d6e8c7a01db73a) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix

## 0.4.6

### Patch Changes

- [#24](https://github.com/udecode/better-auth-convex/pull/24) [`05d0c79`](https://github.com/udecode/better-auth-convex/commit/05d0c79aa6412eebe33e3792f7f00671dcf60b67) Thanks [@zbeyens](https://github.com/zbeyens)! - Move `createSchema` to separate entry point (`better-auth-convex/schema`) to fix Convex bundler error with Node.js `path` module

## 0.4.5

### Patch Changes

- [`ce3dc18`](https://github.com/udecode/better-auth-convex/commit/ce3dc1805fdf333f4c12a084a0afbee9d2e4eb17) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix npm package missing dist folder

## 0.4.4

### Patch Changes

- [`b3ec361`](https://github.com/udecode/better-auth-convex/commit/b3ec361bfa310ba594af763436d1ea57e71a606e) Thanks [@zbeyens](https://github.com/zbeyens)! - Upgrade peer dependencies: `@convex-dev/better-auth@>=0.9.7`, `better-auth@>=1.3.34`, `convex@>=1.29.3`

## 0.4.3

### Patch Changes

- e7c102d: fix: map Convex table names to Better Auth model keys in isUniqueField

## 0.4.2

### Patch Changes

- df53a30: Add support for custom mutation builders in `createClient` and `createApi`. Both functions now accept an optional `internalMutation` parameter, allowing you to wrap internal mutations with custom context (e.g., triggers, aggregates, middleware).

  **Usage:**

  ```ts
  const internalMutation = customMutation(
    internalMutationGeneric,
    customCtx(async (ctx) => ({
      db: triggers.wrapDB(ctx).db,
    })),
  );

  // Pass to createClient
  createClient({
    authFunctions,
    schema,
    internalMutation,
    triggers,
  });

  // Pass to createApi
  createApi(schema, {
    ...auth.options,
    internalMutation,
  });
  ```

## 0.4.1

### Patch Changes

- cd33fd3: `@convex-dev/better-auth@0.9.6`

## 0.4.0

### Minor Changes

- fcbc004: - vendor: `@convex-dev/better-auth` `0.9.5` and `better-auth@1.3.27`
  - fix: swap old and new doc params in onUpdate trigger

    BREAKING CHANGE: 2nd and 3rd params in onUpdate trigger are swapped.
    Previously: `onUpdate(ctx, oldDoc, newDoc)`
    Now: `onUpdate(ctx, newDoc, oldDoc)`

## 0.3.1

### Patch Changes

- 28facf6: Add `getAuthUserIdentity` helper and improve type safety for session IDs

## 0.3.0

### Minor Changes

- 23ec28b: - Fix `sortBy` direction handling in query generation - now correctly applies ascending order when specified
  - fix: use jwt session id for `getSession`, `getHeaders` state

## 0.2.2

### Patch Changes

- 0c27fb4: - `getSession` now accepts an optional `userId` parameter to skip the `getAuthUserId` call when the userId is already known
  - `getHeaders` now accepts an optional `session` parameter to skip the `getSession` call when the session is already available

  These changes improve performance by avoiding redundant database queries when the data is already available.

## 0.2.1

### Patch Changes

- bdb2151: Fix beforeCreate hook validation error

  Previously, the `create` mutation's input validator required all schema fields to be present, causing validation errors when `beforeCreate` hooks tried to add required fields like `username`.

  This fix makes all input fields optional during validation, allowing `beforeCreate` hooks to add or modify any required fields. The actual schema validation still occurs when inserting into the database, ensuring data integrity.

## 0.2.0

### Minor Changes

- bfc2ad3: Add `beforeCreate`, `beforeUpdate`, and `beforeDelete` hook support across the Convex adapter so triggers can transform payloads before database writes.

## 0.1.1

### Patch Changes

- 65f73b8: init

## 0.1.0

### Minor Changes

- e633904: init
