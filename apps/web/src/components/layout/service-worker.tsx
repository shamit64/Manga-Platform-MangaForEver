"use client";

import * as React from "react";

/** Registers the service worker that makes MangaForEver installable and receives push notifications. */
export function ServiceWorker() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Ask for permission and register this device for new-chapter push notifications. */
export async function enablePush(): Promise<"enabled" | "unsupported" | "denied" | "unavailable"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  const { publicKey } = await fetch("/api/v1/push/public-key").then((r) => r.json());
  if (!publicKey) return "unavailable";
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const json = sub.toJSON();
  const res = await fetch("/api/v1/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  return res.ok ? "enabled" : "unavailable";
}
