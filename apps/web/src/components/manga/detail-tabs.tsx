"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function DetailTabs({ tabs }: { tabs: { value: string; label: string; content: React.ReactNode }[] }) {
  const [value, setValue] = React.useState(tabs[0].value);
  // "#reviews" links (e.g. the Rate & review button) switch to the reviews tab.
  React.useEffect(() => {
    const sync = () => {
      const h = window.location.hash.slice(1);
      if (tabs.some((t) => t.value === h)) {
        setValue(h);
        document.getElementById("series-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [tabs]);
  return (
    <Tabs value={value} onValueChange={setValue} id="series-tabs" className="scroll-mt-24">
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} id={t.value} className="pt-6 focus:outline-none">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** Records a view in the user's browsing history (the API ignores it if history is turned off). */
export function ViewTracker({ seriesId, enabled }: { seriesId: string; enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled) return;
    fetch("/api/v1/history/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId }),
    }).catch(() => {});
  }, [seriesId, enabled]);
  return null;
}
