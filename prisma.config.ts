import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Placeholder keeps `prisma generate` working without a database configured.
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mangaverse",
  },
});
