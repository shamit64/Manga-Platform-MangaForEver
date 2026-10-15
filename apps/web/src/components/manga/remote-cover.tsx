"use client";

import Image from "next/image";
import * as React from "react";

/** Provider cover (AniList CDN). Falls back to the generated art if the image can't load. */
export function RemoteCover({
  src,
  alt,
  sizes,
  priority,
  fallback,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return <>{fallback}</>;
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" onError={() => setFailed(true)} />;
}
