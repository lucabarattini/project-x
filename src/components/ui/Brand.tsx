/**
 * Neutral, unbranded product mark: a bold X on a dark tile. The final product
 * name is still to be decided, so headers use the mark without a wordmark.
 */

export function BrandLogo({
  className = "h-9 w-9",
  rounded = "rounded-xl",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-slate-950 text-white dark:bg-white dark:text-slate-950 ${rounded} ${className}`}
    >
      <svg
        aria-hidden="true"
        className="h-[58%] w-[58%]"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={3.4}
        viewBox="0 0 24 24"
      >
        <path d="M5 5 19 19" />
        <path d="M19 5 5 19" />
      </svg>
    </span>
  );
}
