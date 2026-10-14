"use client";

import * as T from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("flex gap-1 overflow-x-auto border-b border-line scrollbar-none", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "-mb-px cursor-pointer whitespace-nowrap border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text data-[state=active]:border-violet data-[state=active]:text-text",
        className,
      )}
      {...props}
    />
  );
}
