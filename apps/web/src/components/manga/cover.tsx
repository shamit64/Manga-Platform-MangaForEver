import Image from "next/image";
import { cn } from "@/lib/utils";

const PALETTES: [string, string][] = [
  ["#251b45", "#8b5cf6"],
  ["#191f4a", "#6366f1"],
  ["#371734", "#e0558a"],
  ["#122d37", "#35b9a9"],
  ["#372812", "#f2a93b"],
  ["#1f1536", "#c4b5fd"],
  ["#1b1a21", "#e8e4f0"],
  ["#361414", "#ef5b4b"],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Series cover. Provider covers render through next/image (optimised, lazy). Sample titles have no
 * licensed artwork, so they get a generated typographic cover instead of a borrowed image.
 */
export function Cover({
  title,
  nativeTitle,
  coverUrl,
  type,
  className,
  sizes = "(max-width: 640px) 45vw, 200px",
  priority,
  compact,
}: {
  title: string;
  nativeTitle?: string | null;
  coverUrl: string | null;
  type?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  compact?: boolean;
}) {
  if (coverUrl) {
    return (
      <div className={cn("relative aspect-[2/3] overflow-hidden rounded-xl bg-raised", className)}>
        <Image src={coverUrl} alt={`Cover of ${title}`} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  const h = hash(title);
  const [bg, fg] = PALETTES[h % PALETTES.length];
  const variant = h % 3;
  const shape =
    variant === 0
      ? `radial-gradient(circle at ${30 + (h % 40)}% ${25 + (h % 30)}%, ${fg} 0 22%, transparent 22.5%)`
      : variant === 1
        ? `linear-gradient(${110 + (h % 50)}deg, transparent 0 38%, ${fg} 38% 52%, transparent 52%)`
        : `repeating-conic-gradient(from ${h % 90}deg at ${20 + (h % 60)}% 30%, ${fg}55 0 2deg, transparent 2deg 9deg)`;
  const native = nativeTitle && nativeTitle !== title && /[^\x00-\x7F]/.test(nativeTitle) ? nativeTitle : null;

  return (
    <div
      role="img"
      aria-label={`Generated cover for ${title}`}
      className={cn("relative isolate aspect-[2/3] overflow-hidden rounded-xl", className)}
      style={{ background: `${shape}, ${bg}` }}
    >
      <div
        className="absolute inset-0 -z-0 opacity-60"
        style={{ backgroundImage: `radial-gradient(${fg}66 1px, transparent 1.5px)`, backgroundSize: "5px 5px", maskImage: "linear-gradient(to top, black 10%, transparent 70%)" }}
      />
      {native && !compact && (
        <span
          className="absolute top-3 right-2.5 max-h-[70%] overflow-hidden text-sm font-semibold tracking-wider text-white/85"
          style={{ writingMode: "vertical-rl", fontFamily: '"Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", "Noto Sans CJK KR", "Noto Sans CJK SC", "Malgun Gothic", sans-serif' }}
        >
          {native}
        </span>
      )}
      {compact ? (
        <span className="absolute inset-0 grid place-items-center font-display text-lg font-extrabold text-white" style={{ textShadow: "0 1px 6px rgba(0,0,0,.6)" }} aria-hidden>
          {title.replace(/^(the|a)\s+/i, "").slice(0, 1)}
        </span>
      ) : (
        <div className="absolute inset-x-0 bottom-0 p-3">
          {type && <span className="mb-1.5 block text-[10px] font-semibold tracking-wide text-white/70">{type.toLowerCase()}</span>}
          <p
            className="font-display text-lg leading-[0.95] font-extrabold text-white"
            style={{ fontVariationSettings: '"wdth" 78', textShadow: "0 2px 12px rgba(0,0,0,.45)" }}
          >
            {title}
          </p>
        </div>
      )}
    </div>
  );
}
