#!/usr/bin/env node
/**
 * One-command local runner (Windows, macOS, Linux) — no Docker or PostgreSQL install needed.
 *
 *   node scripts/local.mjs          production build + start (fast pages)
 *   node scripts/local.mjs --dev    hot-reloading dev servers
 *
 * What it does:
 *   1. creates .env from .env.example on first run (local-only settings, random internal token)
 *   2. starts a private PostgreSQL 18 server from the `embedded-postgres` package, with its data in ./.local-db
 *   3. creates the databases, applies migrations, and seeds sample data the first time
 *   4. builds (first run only) and starts the API on :4000 and the web app on :3000, bound to 127.0.0.1
 *   5. opens http://localhost:3000 in your browser
 * Press Ctrl+C (or close the window) to stop everything. Logs are also written to ./logs.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV = process.argv.includes("--dev");
const NO_OPEN = process.argv.includes("--no-open");
const PG_PORT = Number(process.env.MV_PG_PORT ?? 5433);
const LOG_DIR = path.join(ROOT, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
const mainLog = fs.createWriteStream(path.join(LOG_DIR, "local.log"), { flags: "w" });

const c = (n) => (s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const violet = c("35");
const dim = c("2");
const red = c("31");
const green = c("32");
function say(msg) {
  console.log(`${violet("●")} ${msg}`);
  mainLog.write(`${new Date().toISOString()} ${msg}\n`);
}
class Halt extends Error {}
/** Report a fatal problem, stop everything, and halt the startup sequence. */
function fail(msg, err) {
  if (!(err instanceof Halt)) {
    console.error(red(`✖ ${msg}`));
    if (err) console.error(err);
    mainLog.write(`${new Date().toISOString()} ERROR ${msg} ${err ? String(err.stack ?? err) : ""}\n`);
  }
  shutdown(1);
  throw new Halt(msg);
}

const bin = {
  prisma: path.join(ROOT, "node_modules", "prisma", "build", "index.js"),
  tsx: path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
  tsc: path.join(ROOT, "node_modules", "typescript", "bin", "tsc"),
  next: path.join(ROOT, "node_modules", "next", "dist", "bin", "next"),
};

/** Run a Node CLI to completion, mirroring output to the console and logs/local.log. */
function runNode(label, script, args, opts = {}) {
  say(label);
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: opts.cwd ?? ROOT,
    env: opts.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  mainLog.write(out);
  if (r.status !== 0) {
    console.log(out);
    fail(`${label} failed (exit ${r.status}). See logs/local.log.`);
  } else if (opts.echo) {
    process.stdout.write(dim(out));
  }
  return out;
}

// ───────────────────────── 1. .env ─────────────────────────
function ensureEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    let text = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
    const set = (key, value) => {
      const line = `${key}=${JSON.stringify(value)}`;
      const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
      text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
    };
    set("DATABASE_URL", `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/mangaverse`);
    set("TEST_DATABASE_URL", `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/mangaverse_test`);
    set("HOST", "127.0.0.1");
    set("API_URL", "http://127.0.0.1:4000");
    set("NEXT_PUBLIC_API_URL", "http://localhost:4000");
    set("WEB_ORIGIN", "http://localhost:3000,http://127.0.0.1:3000");
    set("COOKIE_SECURE", "false");
    set("INTERNAL_API_TOKEN", crypto.randomBytes(24).toString("hex"));
    fs.writeFileSync(envPath, text);
    say("Created .env with local settings");
  }
  process.loadEnvFile(envPath);
}

// ───────────────────────── 2. PostgreSQL ─────────────────────────
let pg = null;
async function startPostgres() {
  let EmbeddedPostgres;
  try {
    ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
  } catch (e) {
    fail("The embedded-postgres package isn't installed. Run `npm install` first.", e);
  }
  const dataDir = path.join(ROOT, ".local-db", "data");
  const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
  const pgLog = fs.createWriteStream(path.join(LOG_DIR, "postgres.log"), { flags: "a" });
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: PG_PORT,
    persistent: true,
    // UTF-8 regardless of the Windows code page, so native titles (日本語, 한국어, 中文) store correctly.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: (m) => pgLog.write(m),
    onError: (m) => pgLog.write(`[error] ${m}\n`),
  });
  if (fresh) {
    say("Setting up a private PostgreSQL database in .local-db (first run only)…");
    await pg.initialise();
  }
  if (await portInUse(PG_PORT)) {
    // Most likely our own server left running by a previous window — reuse it if the login works.
    const probe = pg.getPgClient("postgres", "127.0.0.1");
    try {
      await probe.connect();
      await probe.end();
      say(`Reusing the PostgreSQL server already running on port ${PG_PORT}`);
      pg.reused = true;
    } catch (e) {
      fail(`Port ${PG_PORT} is used by another program. Set MV_PG_PORT to a free port and try again.`, e);
    }
  }
  if (!pg.reused) say(`Starting PostgreSQL on 127.0.0.1:${PG_PORT}`);
  try {
    if (!pg.reused) await pg.start();
  } catch (e) {
    fail(
      `PostgreSQL didn't start. Is another server already using port ${PG_PORT}, or is MangaVerse already running in another window? See logs/postgres.log.`,
      e,
    );
  }
  for (const db of ["mangaverse", "mangaverse_test"]) {
    const client = pg.getPgClient("postgres", "127.0.0.1");
    await client.connect();
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!rowCount) await client.query(`CREATE DATABASE ${db}`);
    await client.end();
  }
}

function portInUse(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(true));
    srv.once("listening", () => srv.close(() => resolve(false)));
    srv.listen(port, "127.0.0.1");
  });
}

async function catalogCount() {
  const client = pg.getPgClient("mangaverse", "127.0.0.1");
  await client.connect();
  try {
    const r = await client.query(`SELECT COUNT(*)::int AS n FROM "MangaSeries"`);
    return r.rows[0].n;
  } finally {
    await client.end();
  }
}

// ───────────────────────── 3/4. App ─────────────────────────
const children = [];
/** Next.js picks NODE_ENV itself (build/start = production, dev = development); the API's value must not leak in. */
function nextEnv() {
  const env = { ...process.env };
  delete env.NODE_ENV;
  return env;
}

function startProcess(name, color, script, args, cwd, env = process.env) {
  const log = fs.createWriteStream(path.join(LOG_DIR, `${name}.log`), { flags: "w" });
  const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const tag = c(color)(`[${name}]`);
  const pipe = (stream) => {
    let buf = "";
    stream.on("data", (chunk) => {
      log.write(chunk);
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) console.log(`${tag} ${l}`);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.error(red(`✖ ${name} stopped unexpectedly (exit ${code}). See logs/${name}.log.`));
    shutdown(1);
  });
  children.push(child);
  return child;
}

async function waitFor(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function openBrowser(url) {
  if (NO_OPEN) return;
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(dim("\nStopping MangaVerse…"));
  for (const ch of children) {
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(ch.pid), "/f", "/t"]);
      else ch.kill("SIGINT");
    } catch {
      /* already gone */
    }
  }
  try {
    if (!pg?.reused) await pg?.stop();
  } catch {
    /* already stopped */
  }
  mainLog.end();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));

// ───────────────────────── main ─────────────────────────
async function main() {
  console.log(`\n  ${violet("MangaVerse")} — Discover. Track. Review. Explore.\n`);
  ensureEnv();
  if ((await portInUse(3000)) || (await portInUse(4000))) {
    const alive = await waitFor("http://127.0.0.1:3000/", 3000);
    if (alive) {
      say("MangaVerse already seems to be running — opening http://localhost:3000");
      openBrowser("http://localhost:3000");
      return shutdown(0);
    }
    fail("Port 3000 or 4000 is already in use by another program. Close it and try again.");
  }
  await startPostgres();

  runNode("Applying database migrations", bin.prisma, ["migrate", "deploy"], { echo: false });
  if ((await catalogCount()) === 0) {
    runNode("Loading the sample catalog and demo accounts (first run only)", bin.tsx, ["prisma/seed.ts"], { echo: true });
  }

  const webDir = path.join(ROOT, "apps", "web");
  const apiDir = path.join(ROOT, "apps", "api");
  if (!fs.existsSync(path.join(ROOT, "packages", "shared", "dist", "index.js"))) {
    runNode("Building shared package", bin.tsc, ["-p", "packages/shared/tsconfig.json"]);
  }

  if (DEV) {
    startProcess("api", "35", bin.tsx, ["watch", "src/server.ts"], apiDir);
    startProcess("web", "36", bin.next, ["dev", "-p", "3000", "-H", "127.0.0.1"], webDir, nextEnv());
  } else {
    const builtApi = fs.existsSync(path.join(apiDir, "dist", "server.js"));
    const builtWeb = fs.existsSync(path.join(webDir, ".next", "BUILD_ID"));
    if (!builtApi) runNode("Building the API", bin.tsc, ["-p", "apps/api/tsconfig.build.json"]);
    if (!builtWeb) runNode("Building the web app (first run only, about a minute)…", bin.next, ["build"], { cwd: webDir, env: nextEnv() });
    startProcess("api", "35", path.join(apiDir, "dist", "server.js"), [], apiDir);
    startProcess("web", "36", bin.next, ["start", "-p", "3000", "-H", "127.0.0.1"], webDir, nextEnv());
  }

  say("Waiting for the API and web app to come up…");
  const apiUp = await waitFor("http://127.0.0.1:4000/health", 90_000);
  const webUp = await waitFor("http://127.0.0.1:3000/", DEV ? 180_000 : 90_000);
  if (!apiUp || !webUp) fail(`${!apiUp ? "API" : "Web app"} didn't start in time. See the logs folder.`);

  console.log(`
  ${green("MangaVerse is running")}  →  ${violet("http://localhost:3000")}

  Sign in with:   admin@mangaverse.local / ${process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-1"}
                  reader@mangaverse.local / ${process.env.SEED_DEMO_PASSWORD ?? "DemoReader-1"}
  API docs:       http://localhost:4000/docs

  ${dim("Keep this window open while you use the app. Press Ctrl+C or close it to stop.")}
`);
  say("READY http://localhost:3000");
  openBrowser("http://localhost:3000");
}

main().catch((e) => {
  if (e instanceof Halt) return;
  try {
    fail("Startup failed", e);
  } catch {
    /* halted */
  }
});
