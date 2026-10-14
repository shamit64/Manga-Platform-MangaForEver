// Runs before every test file, before any app module is imported.
try {
  process.loadEnvFile("../../.env"); // picks up TEST_DATABASE_URL if defined there
} catch {
  /* no .env file */
}
process.env.NODE_ENV = "test";
process.env.DISABLE_RATE_LIMIT = "true";
process.env.METADATA_PROVIDER = "none";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mangaverse_test";
