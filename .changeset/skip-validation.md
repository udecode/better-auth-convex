---
"better-auth-convex": minor
---

Add `skipValidation` option to `createApi` for smaller generated types. When enabled, uses generic `v.any()` validators instead of typed validators. Since these are internal functions, validation is optional and this can significantly reduce bundle size.
