---
"better-auth-convex": patch
---

Fix beforeCreate hook validation error

Previously, the `create` mutation's input validator required all schema fields to be present, causing validation errors when `beforeCreate` hooks tried to add required fields like `username`.

This fix makes all input fields optional during validation, allowing `beforeCreate` hooks to add or modify any required fields. The actual schema validation still occurs when inserting into the database, ensuring data integrity.