import { COPY } from "@/lib/config";

/** Intrinsic size of /public/brand/thechefz-logo.webp (official two-block wordmark). */
const LOGO_W = 497;
const LOGO_H = 120;

/**
 * The Chefz wordmark. `height` (px) sizes it; pass `fluid` and height utilities
 * in `className` (e.g. "h-[22px] md:h-[26px]") to size it responsively instead.
 */
export function ChefzLogo({
  height = 26,
  className = "",
  fluid = false,
  priority = false,
}: {
  height?: number;
  className?: string;
  fluid?: boolean;
  priority?: boolean;
}) {
  const width = Math.round((height * LOGO_W) / LOGO_H);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static logo, no optimisation needed
    <img
      src="/brand/thechefz-logo.webp"
      alt={COPY.brand}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={`block w-auto select-none ${className}`}
      style={fluid ? undefined : { height }}
    />
  );
}
