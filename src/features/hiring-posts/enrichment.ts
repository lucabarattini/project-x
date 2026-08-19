import type { ApifyLinkedinPost, JobLinkMetadata } from "./types";
import { isKnownHiringUrl } from "./targets";

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;/giu, "'")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}

function asString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
    return value.name.trim();
  }
  return "";
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function jsonLdNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdNodes);
  if (!value || typeof value !== "object") return [];

  const object = value as Record<string, unknown>;
  const graph = jsonLdNodes(object["@graph"]);
  return [object, ...graph];
}

function formatAddress(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const location = value as Record<string, unknown>;
  const addressValue = location.address && typeof location.address === "object"
    ? location.address as Record<string, unknown>
    : location;
  return [
    asString(addressValue.addressLocality),
    asString(addressValue.addressRegion),
    asString(addressValue.addressCountry),
  ].filter(Boolean).join(", ");
}

export function extractJobMetadataFromHtml(html: string): JobLinkMetadata {
  const scripts = [...html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
  )];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(decodeHtml(script[1]).trim()) as unknown;
      const job = jsonLdNodes(parsed).find((node) => {
        const type = node["@type"];
        return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      });
      if (!job) continue;

      const locations = [
        ...asArray(job.jobLocation).map(formatAddress),
        ...asArray(job.applicantLocationRequirements).map(formatAddress),
      ].filter(Boolean);

      if (job.jobLocationType === "TELECOMMUTE" && locations.length === 0) {
        locations.push("Remote");
      }

      return {
        title: asString(job.title) || null,
        locations: [...new Set(locations)],
      };
    } catch {
      continue;
    }
  }

  return { title: null, locations: [] };
}

export function isSupportedJobUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return isKnownHiringUrl(url.toString());
  } catch {
    return false;
  }
}

async function fetchJobMetadata(url: string): Promise<JobLinkMetadata> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(6_000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (compatible; ABetterLinkedIn/1.0)",
      },
    });
    if (!response.ok || !isSupportedJobUrl(response.url)) {
      return { title: null, locations: [] };
    }
    return extractJobMetadataFromHtml(await response.text());
  } catch {
    return { title: null, locations: [] };
  }
}

export async function enrichJobLinks(rawPosts: ApifyLinkedinPost[]) {
  const urls = [...new Set(
    rawPosts
      .map((post) => post.article?.link?.trim() ?? "")
      .filter(isSupportedJobUrl),
  )];
  const metadata = new Map<string, JobLinkMetadata>();
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const current = urls[index];
      index += 1;
      metadata.set(current, await fetchJobMetadata(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));
  return metadata;
}
