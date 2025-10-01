---
'better-auth-convex': patch
---

- `getSession` now accepts an optional `userId` parameter to skip the `getAuthUserId` call when the userId is already known
- `getHeaders` now accepts an optional `session` parameter to skip the `getSession` call when the session is already available

These changes improve performance by avoiding redundant database queries when the data is already available.
