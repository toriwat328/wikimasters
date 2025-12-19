# Errata: Neon Auth to Stack Auth Migration

**Date:** December 2025

**Affected Steps:** 04-database through 09-with-tests

---

## What Changed

Neon Auth (powered by Stack Auth) has been deprecated. The `usersSync` table from `drizzle-orm/neon` that auto-synced users no longer works.

**Solution:** Sign up for Stack Auth directly and sync users manually when they create articles.

---

## Sign Up for Stack Auth

1. Go to https://stack-auth.com and create an account
2. Create a new project
3. Add these credentials to `.env.local`:
   - `NEXT_PUBLIC_STACK_PROJECT_ID`
   - `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`
   - `STACK_SECRET_SERVER_KEY`

---

## Code Changes (Steps 04-09)

### 1. `src/db/schema.ts`

Remove the import and add a custom `usersSync` table at the bottom:

```typescript
// REMOVE this line:
import { usersSync } from "drizzle-orm/neon";

// ADD this at the bottom of the file:
export const usersSync = pgTable("usersSync", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
});
export type User = typeof usersSync.$inferSelect;
```

### 2. `src/db/sync-user.ts` (new file)

```typescript
import db from "@/db/index";
import { usersSync } from "@/db/schema";

type StackUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
};

export async function ensureUserExists(stackUser: StackUser): Promise<void> {
  await db
    .insert(usersSync)
    .values({
      id: stackUser.id,
      name: stackUser.displayName,
      email: stackUser.primaryEmail,
    })
    .onConflictDoUpdate({
      target: usersSync.id,
      set: {
        name: stackUser.displayName,
        email: stackUser.primaryEmail,
      },
    });
}
```

### 3. `src/app/actions/articles.ts`

Add the import and call `ensureUserExists` in `createArticle()`:

```typescript
import { ensureUserExists } from "@/db/sync-user";

export async function createArticle(data: CreateArticleInput) {
  const user = await stackServerApp.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  await ensureUserExists(user);  // ADD THIS LINE

  // ... rest unchanged
}
```

### 4. Update imports in other files

Change `import { usersSync } from "drizzle-orm/neon"` to `import { usersSync } from "@/db/schema"` in:

- `src/lib/data/articles.ts`
- `src/db/seed.ts` (also updated to auto-create a seed user if none exist)
- `src/email/celebration-email.tsx` (steps 07+)

---

## After Changes

Run the database migration:

```bash
npm run db:generate
npm run db:push
```

---

## Why This Works

Stack Auth still handles authentication. The only difference is we now manually sync user data to our database when users create articles, instead of relying on Neon's automatic sync.
