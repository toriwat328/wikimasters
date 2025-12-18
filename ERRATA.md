# Errata: Neon Auth to Stack Auth Migration

**Date:** December 2025

**Issue:** Neon Auth (which was powered by Stack Auth) has been deprecated. Students can no longer sign up through Neon Auth. However, Stack Auth still works directly, and all authentication checks in the course code function correctly with Stack Auth.

**Problem:** The course uses a `usersSync` table (provided by `drizzle-orm/neon`) that automatically synced user data from Neon Auth into your PostgreSQL database. When using Stack Auth directly, this automatic sync doesn't happen, so the `usersSync` table remains empty. This breaks:
- Foreign key references from `articles.authorId` to `usersSync.id`
- Author name resolution in article listings
- The celebration email feature (which looks up user email/name)

**Solution:** Replace the `usersSync` import with a custom `users` table and add a helper function to sync user data on first article creation.

---

## Steps Affected

This errata applies to steps **04-database** through **09-with-tests**. Steps 00-03 do not use the database and are unaffected.

---

## Step 1: Sign Up for Stack Auth (Instead of Neon Auth)

Instead of using Neon Auth, sign up directly at [Stack Auth](https://stack-auth.com):

1. Go to https://stack-auth.com and create an account
2. Create a new project
3. Get your credentials from the dashboard:
   - `NEXT_PUBLIC_STACK_PROJECT_ID`
   - `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`
   - `STACK_SECRET_SERVER_KEY`
4. Add these to your `.env.local` file (the same variables the course already uses)

The Stack Auth setup in the course code (`src/stack/server.tsx` and `src/stack/client.tsx`) works unchanged.

---

## Step 2: Update the Database Schema

Replace the `usersSync` import with a custom `users` table.

**File: `src/db/schema.ts`**

Change from:
```typescript
import { usersSync } from "drizzle-orm/neon";
import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
  summary: text("summary"),
  imageUrl: text("image_url"),
  published: boolean("published").default(false).notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => usersSync.id),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});
```

Change to:
```typescript
import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Custom users table to store Stack Auth user info
// (replaces the deprecated usersSync from drizzle-orm/neon)
export const users = pgTable("users", {
  id: text("id").primaryKey(),  // Stack Auth user ID
  name: text("name"),
  email: text("email"),
});

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
  summary: text("summary"),
  imageUrl: text("image_url"),
  published: boolean("published").default(false).notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

const schema = { articles, users };
export default schema;

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type User = typeof users.$inferSelect;
```

---

## Step 3: Create a User Sync Helper

Create a new file to handle syncing Stack Auth users to your database.

**File: `src/db/sync-user.ts`** (new file)

```typescript
import db from "@/db/index";
import { users } from "@/db/schema";

type StackUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
};

/**
 * Ensures the Stack Auth user exists in our local users table.
 * Call this before creating articles to ensure the foreign key reference works.
 */
export async function ensureUserExists(stackUser: StackUser): Promise<void> {
  await db
    .insert(users)
    .values({
      id: stackUser.id,
      name: stackUser.displayName,
      email: stackUser.primaryEmail,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: stackUser.displayName,
        email: stackUser.primaryEmail,
      },
    });
}
```

---

## Step 4: Update the Article Actions

Add the user sync call when creating articles.

**File: `src/app/actions/articles.ts`**

Add the import at the top:
```typescript
import { ensureUserExists } from "@/db/sync-user";
```

Then update the `createArticle` function to call `ensureUserExists` before inserting:

```typescript
export async function createArticle(data: CreateArticleInput) {
  const user = await stackServerApp.getUser();
  if (!user) {
    throw new Error("❌ Unauthorized");
  }

  // Sync the Stack Auth user to our local database
  await ensureUserExists(user);

  console.log("✨ createArticle called:", data);
  // ... rest of the function unchanged
}
```

---

## Step 5: Update Data Queries

Replace `usersSync` with `users` in your data queries.

**File: `src/lib/data/articles.ts`**

Change from:
```typescript
import { usersSync } from "drizzle-orm/neon";
```

Change to:
```typescript
import { users } from "@/db/schema";
```

Then update the queries to use `users` instead of `usersSync`:

```typescript
// In getArticles()
.leftJoin(users, eq(articles.authorId, users.id));

// In getArticleById()
.leftJoin(users, eq(articles.authorId, users.id));
```

The `select` statements remain the same since the field names (`name`, `email`, `id`) are identical.

---

## Step 6: Update Celebration Email (Steps 07+)

**File: `src/email/celebration-email.tsx`**

Change from:
```typescript
import { usersSync } from "drizzle-orm/neon";
```

Change to:
```typescript
import { users } from "@/db/schema";
```

Update the query:
```typescript
const response = await db
  .select({
    email: users.email,
    id: users.id,
    title: articles.title,
    name: users.name,
  })
  .from(articles)
  .leftJoin(users, eq(articles.authorId, users.id))
  .where(eq(articles.id, articleId));
```

---

## Step 7: Update Seed Script (Optional)

If you want the seed script to work, update it to query the `users` table.

**File: `src/db/seed.ts`**

Change from:
```typescript
import { usersSync } from "drizzle-orm/neon";
```

Change to:
```typescript
import { users } from "@/db/schema";
```

Update the query:
```typescript
const existingUsers = await db
  .select({ id: users.id })
  .from(users)
  .orderBy(users.id);
const ids = existingUsers.map((user) => user.id);
```

**Note:** The seed script will only work after you've created at least one article (which syncs your user). Alternatively, you can manually insert your Stack Auth user ID into the users table first.

---

## Step 8: Run Database Migration

After making these schema changes, you need to generate and run a migration:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Or if you prefer to push directly (for development):

```bash
npx drizzle-kit push
```

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `src/db/schema.ts` | Replace `usersSync` import with custom `users` table |
| `src/db/sync-user.ts` | **New file** - helper to sync Stack Auth users |
| `src/app/actions/articles.ts` | Add `ensureUserExists()` call in `createArticle` |
| `src/lib/data/articles.ts` | Replace `usersSync` with `users` in imports and JOINs |
| `src/email/celebration-email.tsx` | Replace `usersSync` with `users` (steps 07+) |
| `src/db/seed.ts` | Replace `usersSync` with `users` (optional) |

---

## Why This Works

1. **Stack Auth still handles authentication** - The `stackServerApp.getUser()` calls work exactly as before
2. **User data is synced on-demand** - When a user creates their first article, their info is saved to the `users` table
3. **Foreign keys still work** - The `articles.authorId` references `users.id` instead of `usersSync.id`
4. **Minimal video impact** - The UI/UX is identical; only the underlying data storage changes

---

## Questions?

If you run into issues with this errata, please open an issue on the course repository or reach out through the course community.
