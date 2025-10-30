---
'better-auth-convex': patch
---

Add support for custom mutation builders in `createClient` and `createApi`. Both functions now accept an optional `internalMutation` parameter, allowing you to wrap internal mutations with custom context (e.g., triggers, aggregates, middleware).

**Usage:**

```ts
const internalMutation = customMutation(
  internalMutationGeneric,
  customCtx(async (ctx) => ({
    db: triggers.wrapDB(ctx).db,
  }))
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
