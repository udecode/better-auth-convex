---
'better-auth-convex': minor
---

- vendor: `@convex-dev/better-auth` `0.9.5` and `better-auth@1.3.27`
- fix: swap old and new doc params in onUpdate trigger

  BREAKING CHANGE: 2nd and 3rd params in onUpdate trigger are swapped.
  Previously: `onUpdate(ctx, oldDoc, newDoc)`
  Now: `onUpdate(ctx, newDoc, oldDoc)`
