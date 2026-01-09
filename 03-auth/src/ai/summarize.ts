//import { anthropic } from "@ai-sdk/anthropic"
//import { openai } from "@ai-sdk/openai"
import { generateText } from "ai";

export async function summarizeArticle(
  title: string,
  article: string,
): Promise<string> {
  if (!article || !article.trim()) {
    throw new Error("Article content is required to generate a summary.");
  }

  const prompt = `Summarize the following wiki article in 1-2 concise sentences. Focus on the main idea and the most important details a reader should remember. Do not add opinions or unrelated information. The point is that readers can see the summary a glance and decide if they want to read more.\n\nTitle:\n${title}\n\nArticle:\n${article}`;

  //model:anthropic("claude-haiku-4-5")

  const { text } = await generateText({
    model: "openai/gpt-5-nano",
    system: "You are an assistant that writes concise factual summaries.",
    prompt,
  });

  return (text ?? "").trim();
}

export default summarizeArticle;
