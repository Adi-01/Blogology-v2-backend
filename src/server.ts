import { env } from "@/config/env.js";
import app from "./app.js";
import { prisma } from "@/lib/prisma.js";
import { redis } from "@/lib/redis.js";
import { logger } from "@/lib/logger.js";

async function initDatabase(): Promise<void> {
  try {
    // Ensure essential plans exist for user registration and billing
    await prisma.plan.upsert({
      where: { name: "FREE" },
      update: {},
      create: { name: "FREE", aiDailyLimit: 10, price: 0 },
    });
    await prisma.plan.upsert({
      where: { name: "PRO" },
      update: {},
      create: { name: "PRO", aiDailyLimit: 100, price: 1500 },
    });

    // Ensure default tags exist for onboarding and topic exploration
    const defaultTags = [
      "technology",
      "ai",
      "webdev",
      "programming",
      "productivity",
      "startups",
      "design",
      "writing",
    ];
    for (const name of defaultTags) {
      await prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      });
    }
    logger.info("Database essential data verified (plans, default tags)");
  } catch (error) {
    logger.error("Database initialization warning:", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

await initDatabase();

const server = app.listen(env.PORT, "0.0.0.0", () => {
  logger.info(`Server running on http://0.0.0.0:${env.PORT}`, {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  });
});

let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  // Force exit after 10s if graceful drainage hangs
  const forceExitTimer = setTimeout(() => {
    logger.error("Forced process termination after shutdown timeout");
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  server.close(async (err) => {
    if (err) {
      logger.error("Error while closing HTTP server", { error: err.message });
      process.exit(1);
    }

    try {
      logger.info("Closing Prisma and Redis connections...");
      await Promise.all([
        prisma.$disconnect(),
        redis.quit(),
      ]);
      logger.info("Graceful shutdown completed successfully.");
      process.exit(0);
    } catch (cleanupError) {
      logger.error("Error during resource cleanup", {
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      });
      process.exit(1);
    }
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
