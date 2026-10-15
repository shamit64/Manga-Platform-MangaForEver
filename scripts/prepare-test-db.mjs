// Applies migrations to the test database (TEST_DATABASE_URL) so `npm test` can run.
import { execSync } from "node:child_process";
try { process.loadEnvFile(".env"); } catch { /* no .env — rely on the environment */ }
const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mangaforever_test";
console.log(`Applying migrations to ${url.replace(/:[^:@/]+@/, ":****@")}`);
execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
