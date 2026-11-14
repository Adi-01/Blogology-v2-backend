import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "@/lib/logger.js";

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();

  // Attach requestId to request and response header
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - start;

    logger.info("HTTP Request", {
      requestId,
      method: req.method,
      route: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
};

export default requestLogger;
