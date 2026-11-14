import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma.js";
import { redis } from "@/lib/redis.js";
import { REDIS_KEYS, REDIS_TTL } from "@/lib/constants.js";
import { env } from "@/config/env.js";
import { TooManyRequestsError } from "@/errors/TooManyRequestsError.js";
import { UnauthorizedError } from "@/errors/UnauthorizedError.js";
import type { AiStreamInput } from "@/validators/ai.validator.js";

const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemma-4-26b-a4b-it",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.7-flash",
  "gemma-4-31b-it",
  "gemini-flash-latest",
];

export class AiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY || "" });
  }

  async checkAndIncrementUsage(userId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { plan: true },
    });

    if (!user) {
      throw new UnauthorizedError({
        code: "USER_NOT_FOUND",
        message: "User session is invalid.",
      });
    }

    const dailyLimit = user.plan?.aiDailyLimit ?? 10;
    const cacheKey = REDIS_KEYS.aiRateLimit(userId, today);

    let count = 0;
    const cachedCount = await redis.get(cacheKey);

    if (cachedCount !== null) {
      count = parseInt(cachedCount, 10);
    } else {
      const dbUsage = await prisma.aiUsage.findUnique({
        where: { userId_date: { userId, date: today } },
      });
      count = dbUsage?.count ?? 0;
      await redis.set(cacheKey, count, "EX", REDIS_TTL.AI_RATE_LIMIT_SECONDS);
    }

    if (count >= dailyLimit) {
      throw new TooManyRequestsError("You've reached your daily AI limit. Upgrade your plan.");
    }

    // Increment count in Redis and DB
    await redis.incr(cacheKey);
    await prisma.aiUsage.upsert({
      where: { userId_date: { userId, date: today } },
      create: { userId, date: today, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  async generateStream(input: AiStreamInput): Promise<AsyncIterable<any>> {
    let systemInstruction = "";
    let contents = "";

    switch (input.feature) {
      case "compose":
        systemInstruction =
          "You are a skilled writing assistant for Blogology writers. Draft well-structured, engaging story content using standard markdown (headings, paragraphs, bullet/numbered lists, and bold/italic highlights). Always use clear line breaks between headings and paragraphs. Return ONLY the drafted text without preamble or conversational commentary.";
        contents = input.prompt
          ? `User Prompt: ${input.prompt}\n\nExisting Context:\n${input.context}`
          : `Context:\n${input.context}`;
        break;

      case "rephrase":
        const toneSpec = input.tone ? ` in a ${input.tone} tone` : "";
        systemInstruction =
          `You are an expert editorial copy editor. Rewrite the provided text${toneSpec} with improved clarity, flow, vocabulary, and polish while strictly preserving the author's meaning and voice. Format with clean markdown if styling was present. Return ONLY the rewritten text without conversational preamble or commentary.`;
        contents = `Text to rephrase:\n${input.context || input.prompt || ""}`;
        break;

      case "summarise":
        systemInstruction =
          "You are an executive editor. Summarize the following blog post in a comprehensive, engaging paragraph of 100 to 110 words. Cover the central thesis, primary arguments, and key takeaway for the reader. Return ONLY the summary paragraph without conversational preamble or commentary.";
        contents = `Article content:\n${input.context || input.prompt || ""}`;
        break;
    }

    const fullPrompt = `${systemInstruction}\n\n${contents}`;
    let lastError: any = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const stream = await this.ai.models.generateContentStream({
          model,
          contents: fullPrompt,
        });
        return stream;
      } catch (err: any) {
        lastError = err;
        console.warn(`[AiService] Candidate model ${model} failed, attempting next candidate:`, err.message);
      }
    }

    throw lastError || new Error("Failed to initialize AI stream with candidate models.");
  }

  /**
   * Retrieves stored summary for a post, checking Redis cache first then DB
   */
  async getPostSummary(postId: string): Promise<string | null> {
    const cached = await redis.get(REDIS_KEYS.postSummary(postId));
    if (cached) {
      return cached;
    }

    const post = await prisma.post.findUnique({
      where: { id: postId, isDeleted: false },
      select: { summary: true },
    });

    if (post?.summary) {
      await redis.set(
        REDIS_KEYS.postSummary(postId),
        post.summary,
        "EX",
        REDIS_TTL.POST_SUMMARY_SECONDS,
      );
      return post.summary;
    }

    return null;
  }

  /**
   * Acquires a temporary mutex lock (45s TTL) for in-flight post summary generation
   */
  async acquireSummaryLock(postId: string): Promise<boolean> {
    const key = REDIS_KEYS.aiSummaryLock(postId);
    const result = await redis.set(key, "1", "EX", 45, "NX");
    return result === "OK";
  }

  /**
   * Releases the in-flight post summary mutex lock
   */
  async releaseSummaryLock(postId: string): Promise<void> {
    await redis.del(REDIS_KEYS.aiSummaryLock(postId));
  }

  /**
   * Persists completed summary into PostgreSQL Post record and warms Redis cache
   */
  async savePostSummary(postId: string, summary: string): Promise<void> {
    const cleanSummary = summary.trim();
    if (!cleanSummary) return;

    await prisma.post.update({
      where: { id: postId },
      data: {
        summary: cleanSummary,
        summarisedAt: new Date(),
      },
    });

    await redis.set(
      REDIS_KEYS.postSummary(postId),
      cleanSummary,
      "EX",
      REDIS_TTL.POST_SUMMARY_SECONDS,
    );
  }

  /**
   * Waits for an in-flight summary generation to complete and return the result
   */
  async waitForSummary(postId: string, maxWaitMs = 30000): Promise<string | null> {
    const startTime = Date.now();
    const lockKey = REDIS_KEYS.aiSummaryLock(postId);

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 250));

      const summary = await this.getPostSummary(postId);
      if (summary) {
        return summary;
      }

      const lockExists = await redis.exists(lockKey);
      if (!lockExists) {
        return await this.getPostSummary(postId);
      }
    }

    return null;
  }
}

export const aiService = new AiService();
