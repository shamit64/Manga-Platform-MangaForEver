import type { Request, Response } from "express";

/**
 * Server-sent events hub. Open browsers keep one connection to GET /api/v1/events and receive:
 *   event: chapter       a new chapter anywhere on the site (powers the live Latest Updates grid)
 *   event: notification  a new notification for the signed-in member (powers the bell)
 * The web app falls back to polling every 60 seconds where streaming is unavailable.
 */
interface Client {
  res: Response;
  userId: string | null;
}

const clients = new Set<Client>();
const MAX_CLIENTS = 2000;

function write(c: Client, event: string, data: unknown) {
  try {
    c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(c);
  }
}

export function connect(req: Request, res: Response) {
  if (clients.size >= MAX_CLIENTS) {
    res.status(503).json({ error: { code: "BUSY", message: "Live updates are busy; falling back to polling." } });
    return;
  }
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("retry: 15000\n\n");
  const client: Client = { res, userId: req.user?.id ?? null };
  clients.add(client);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

/** Broadcast to every open browser. */
export function broadcast(event: string, data: unknown) {
  for (const c of clients) write(c, event, data);
}

/** Send to the given members' open browsers only. */
export function sendToUsers(userIds: Iterable<string>, event: string, data: unknown) {
  const ids = new Set(userIds);
  if (!ids.size) return;
  for (const c of clients) if (c.userId && ids.has(c.userId)) write(c, event, data);
}

export const connectedClients = () => clients.size;
