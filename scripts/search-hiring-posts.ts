import { loadEnvConfig } from "@next/env";
import {
  readHiringPostFeed,
  runPostSearchActor,
  writeHiringPostFeed,
} from "../src/features/hiring-posts/apify-client";
import { enrichJobLinks } from "../src/features/hiring-posts/enrichment";
import { mergeHiringPostFeed } from "../src/features/hiring-posts/feed";
import { normalizeHiringPosts } from "../src/features/hiring-posts/normalize";
import {
  buildTargetedPostSearchInput,
  targetedSearchResultCeiling,
  untrackedCompanies,
} from "../src/features/hiring-posts/targeted-search";
import type { ApifyLinkedinPost } from "../src/features/hiring-posts/types";
import type { HiringPostSearchWindow } from "../src/features/hiring-posts/search-config";

/** Apify's pay-per-result price for this Actor, for the pre-flight estimate. */
const usdPerResult = 0.002;

function flag(name: string) {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match?.slice(name.length + 3);
}

function main() {
  loadEnvConfig(process.cwd());

  const companies = (flag("companies") ?? "DoorDash,Anthropic,Amazon")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const postedLimit = (flag("window") ?? "week") as HiringPostSearchWindow;
  const maxPosts = Number(flag("max-posts") ?? 25);
  const commit = process.argv.includes("--commit");

  const input = buildTargetedPostSearchInput({ companies, postedLimit, maxPosts });
  const ceiling = targetedSearchResultCeiling(input.searchQueries.length, input.maxPosts);
  const untracked = untrackedCompanies(companies);

  console.log(`Companies : ${companies.join(", ")}`);
  console.log(`Queries   : ${input.searchQueries.length} outreach families`);
  console.log(`Window    : ${input.postedLimit} · maxPosts ${input.maxPosts} per query`);
  console.log(`Ceiling   : ${ceiling} results ≈ $${(ceiling * usdPerResult).toFixed(2)} worst case`);
  if (untracked.length > 0) {
    console.log(
      `\n⚠ Not target companies, their posts are dropped at ingest: ${untracked.join(", ")}`,
    );
  }
  if (!commit) {
    console.log("\nDry run. Re-run with --commit to spend the above and ingest the results.");
    return;
  }
  return run(input);
}

async function run(input: ReturnType<typeof buildTargetedPostSearchInput>) {
  console.log("\nRunning the Actor (the scheduled task is untouched)…");
  const rawPosts = await runPostSearchActor(input) as ApifyLinkedinPost[];
  console.log(`Actor returned ${rawPosts.length} posts ≈ $${(rawPosts.length * usdPerResult).toFixed(2)}`);
  if (rawPosts.length === 0) return;

  const now = new Date();
  const [stored, metadata] = await Promise.all([readHiringPostFeed(), enrichJobLinks(rawPosts)]);
  const normalized = normalizeHiringPosts(rawPosts, now, metadata);
  const next = mergeHiringPostFeed(stored, normalized, {
    runId: `targeted-${Date.now()}`,
    rawCount: rawPosts.length,
    now,
  });
  if (next === stored) {
    console.log("Every post was already in the feed — nothing written.");
    return;
  }
  await writeHiringPostFeed(next);
  console.log(`Feed ${stored.posts.length} → ${next.posts.length} posts.`);

  const fresh = next.posts.filter((post) => !stored.posts.some((old) => old.id === post.id));
  console.log(`\n${fresh.length} new:`);
  for (const post of fresh) {
    console.log(`  [${post.company}/${post.roleFamily}/${post.matchStatus}] ${post.author.name}`);
    console.log(`    ${post.linkedinUrl}`);
  }
}

Promise.resolve(main()).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
