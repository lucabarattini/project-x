"use client";

import Image from "next/image";
import { useState } from "react";
import { companyInitials, companyLogoClassName } from "@/features/jobs/display";
import { companyLogoPath } from "./branding";

const sizeClasses = {
  sm: "h-8 w-8 rounded-lg text-[10px]",
  md: "h-11 w-11 rounded-xl text-xs",
  lg: "h-14 w-14 rounded-2xl text-sm",
};

/**
 * Rendered pixel size per variant, matching sizeClasses above.
 *
 * These logos are always painted at a fixed box, so they take `width`/`height`
 * rather than `fill`. With `fill` Next cannot know the intrinsic size and
 * emits the whole responsive ladder — a 32px logo shipped a 15-entry srcset
 * running up to 3840w, with the bare `src` pointing at the 3840w render. That
 * was ~1.1kB of markup per logo and 257kB across the page, to paint a favicon.
 * Fixed dimensions collapse it to the 1x/2x pair the box can actually use.
 */
const sizePixels = {
  sm: 32,
  md: 44,
  lg: 56,
};

type CompanyLogoProps = {
  company: string;
  size?: keyof typeof sizeClasses;
  className?: string;
  decorative?: boolean;
};

export function CompanyLogo({
  company,
  size = "md",
  className = "",
  decorative = false,
}: CompanyLogoProps) {
  const logoPath = companyLogoPath(company);
  const [failedLogoPath, setFailedLogoPath] = useState<string | null>(null);

  return (
    <span
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : `${company} logo`}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200/90 bg-white font-bold text-slate-700 shadow-[0_4px_14px_rgba(15,23,42,0.08)] ${sizeClasses[size]} ${className}`}
      role={decorative ? undefined : "img"}
    >
      {logoPath && failedLogoPath !== logoPath ? (
        <Image
          alt=""
          className="h-full w-full object-contain p-[18%]"
          height={sizePixels[size]}
          onError={() => setFailedLogoPath(logoPath)}
          src={logoPath}
          width={sizePixels[size]}
        />
      ) : (
        <span className={`flex h-full w-full items-center justify-center ${companyLogoClassName(company)}`}>
          {companyInitials(company)}
        </span>
      )}
    </span>
  );
}
