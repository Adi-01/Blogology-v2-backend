import type { Request, Response, NextFunction } from "express";
import { aiService } from "@/services/ai.service.js";

export class AiController {
  async stream(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { feature, postId } = req.body;
    let lockAcquired = false;

    try {
      const userId = req.user!.id;

      // Special handling for story summarisation: check cache & prevent duplicate generation
      if (feature === "summarise" && postId) {
        // 1. If summary already exists in DB or Redis, serve immediately without charging quota
        const existingSummary = await aiService.getPostSummary(postId);
        if (existingSummary) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.flushHeaders?.();

          res.write(`data: ${JSON.stringify({ token: existingSummary })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }

        // 2. Try acquiring lock to generate summary
        lockAcquired = await aiService.acquireSummaryLock(postId);

        // If another request is currently generating it, wait for their result (do not charge quota!)
        if (!lockAcquired) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.flushHeaders?.();

          const waitedSummary = await aiService.waitForSummary(postId);
          if (waitedSummary) {
            res.write(`data: ${JSON.stringify({ token: waitedSummary })}\n\n`);
            res.write("data: [DONE]\n\n");
            res.end();
            return;
          }

          // If waiting timed out or lock cleared without result, attempt to acquire lock again
          lockAcquired = await aiService.acquireSummaryLock(postId);
        }
      }

      // 3. Quota & Rate Limit Verification (only for actual generation)
      await aiService.checkAndIncrementUsage(userId);

      // 4. Set SSE Headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      let isClosed = false;
      req.on("close", async () => {
        isClosed = true;
        if (lockAcquired && postId) {
          await aiService.releaseSummaryLock(postId).catch(() => {});
        }
        console.log("[AiController] client disconnected, stream destroyed");
      });

      // 5. Obtain upstream AI stream
      const stream = await aiService.generateStream(req.body);

      let accumulatedSummary = "";

      // 6. Pipe tokens as SSE events
      for await (const chunk of stream) {
        if (isClosed) {
          break;
        }

        const token = chunk.text;
        if (token) {
          if (feature === "summarise") {
            accumulatedSummary += token;
          }
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
      }

      // 7. On successful completion of summarise, persist to DB and release lock
      if (!isClosed) {
        if (feature === "summarise" && postId && accumulatedSummary.trim()) {
          try {
            await aiService.savePostSummary(postId, accumulatedSummary);
          } catch (saveErr) {
            console.error("[AiController] Failed to persist post summary to DB:", saveErr);
          }
        }

        res.write("data: [DONE]\n\n");
        res.end();
      }
    } catch (error) {
      if (res.headersSent) {
        res.write(`data: [ERROR] ${error instanceof Error ? error.message : "Stream error"}\n\n`);
        res.end();
      } else {
        next(error);
      }
    } finally {
      if (lockAcquired && postId) {
        await aiService.releaseSummaryLock(postId).catch(() => {});
      }
    }
  }
}

export const aiController = new AiController();
