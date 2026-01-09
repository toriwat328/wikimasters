import { eq } from "drizzle-orm";
import redis from "@/cache";
import db from "@/db/index";
import { articles, usersSync } from "@/db/schema";

export type Article = {
  id: number;
  title: string;
  content: string;
  summary: string | null;
  createdAt: string; // or Date if you transform it
  author: string | null;
};

export async function getArticles(): Promise<Article[]> {
  const cached = await redis.get<Article[]>("articles:all");
  if (cached) {
    console.log("🎯 Get Articles Cache Hit!");
    return cached;
  }
  console.log("🙅‍♂️ Get Articles Cache Miss!");

  const response: Article[] = await db
    .select({
      title: articles.title,
      id: articles.id,
      createdAt: articles.createdAt,
      content: articles.content,
      author: usersSync.name,
      summary: articles.summary,
    })
    .from(articles)
    .leftJoin(usersSync, eq(articles.authorId, usersSync.id));

  redis.set("articles:all", response, {
    ex: 60, // one minute
  });

  return response;
}

export async function getArticleById(id: number) {
  const response = await db
    .select({
      title: articles.title,
      id: articles.id,
      createdAt: articles.createdAt,
      content: articles.content,
      author: usersSync.name,
      imageUrl: articles.imageUrl,
    })
    .from(articles)
    .where(eq(articles.id, id))
    .leftJoin(usersSync, eq(articles.authorId, usersSync.id));
  return response[0] ? response[0] : null;
}
