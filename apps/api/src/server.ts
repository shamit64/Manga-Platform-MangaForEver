import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();
const onListen = () => logger.info(`MangaVerse API listening on http://${env.HOST ?? "localhost"}:${env.PORT} (docs at /docs)`);
const server = env.HOST ? app.listen(env.PORT, env.HOST, onListen) : app.listen(env.PORT, onListen);

// Periodically remove expired sessions and reset tokens.
const sweeper = setInterval(
  () => {
    const now = new Date();
    Promise.all([
      prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]).catch((err) => logger.warn({ err }, "Session sweep failed"));
  },
  60 * 60_000,
);
sweeper.unref();

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
