import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { openApiDocument } from "./docs/openapi.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { loadSession } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { globalLimiter, originCheck } from "./middleware/security.js";
import { api } from "./routes/index.js";
import { jobRun, requireJobsToken } from "./controllers/live.controller.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      autoLogging: !env.isTest,
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  // Swagger UI needs inline scripts/styles on /docs only.
  app.use("/docs", helmet({ contentSecurityPolicy: false }));
  app.use(/^(?!\/docs).*/, helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.allowedOrigins.includes(origin)),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
  );
  // Never compress the live event stream: compression buffers it.
  app.use(compression({ filter: (req, res) => !req.path.endsWith("/events") && compression.filter(req, res) }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(globalLimiter);

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "up" });
    } catch {
      res.status(503).json({ status: "degraded", database: "down" });
    }
  });

  app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: "MangaForEver API" }));

  // Scheduled jobs: called by the scheduler with JOBS_TOKEN, never by browsers.
  app.post("/internal/jobs/:job", requireJobsToken, jobRun);

  app.use("/api/v1", originCheck, loadSession, api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
