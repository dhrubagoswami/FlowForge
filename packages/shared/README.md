# @flowforge/shared

Types, Zod schemas, and constants shared by `server`, `worker`, and `web`. No logic beyond validation and pure type definitions lives here.

**Zod version: v4.** The API surface differs from v3 in places (e.g. `z.record` requires an explicit key schema, `z.url()`/`z.strictObject()` are top-level helpers, custom issues use `code: 'custom'`). Don't copy v3-era patterns from older examples or memory — check the v4 docs.
