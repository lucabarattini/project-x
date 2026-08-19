import { loadEnvConfig } from "@next/env";
import {
  buildLinkedinPostSearchInput,
  findHiringPostCompanyBatchIndex,
  hiringPostCompanyBatches,
  hiringPostCompanyCycleHours,
  projectedMonthlyPostMaximum,
} from "../src/features/hiring-posts/search-config";
import { hiringPostCompanyCount } from "../src/features/hiring-posts/targets";

const apiBase = "https://api.apify.com/v2";

async function currentBatchIndex(taskId: string, token: string) {
  const response = await fetch(
    `${apiBase}/actor-tasks/${encodeURIComponent(taskId)}/input`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return -1;
  const input = await response.json() as { authorsCompanies?: unknown };
  return findHiringPostCompanyBatchIndex(input.authorsCompanies);
}

async function main() {
  loadEnvConfig(process.cwd());

  const token = process.env.APIFY_TOKEN?.trim();
  const taskId = process.env.APIFY_TASK_ID?.trim();
  if (!token || !taskId) {
    throw new Error("APIFY_TOKEN and APIFY_TASK_ID must be present in .env.local");
  }

  // Rewriting the task input is how the webhook advances the company rotation.
  // Re-syncing must therefore preserve wherever the cycle currently sits,
  // otherwise every manual sync silently restarts it at the first batch and
  // skips the companies that were next in line.
  const existingIndex = await currentBatchIndex(taskId, token);
  const batchIndex = existingIndex < 0 ? 0 : existingIndex;

  const input = buildLinkedinPostSearchInput("24h", undefined, batchIndex);
  const response = await fetch(
    `${apiBase}/actor-tasks/${encodeURIComponent(taskId)}/input`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    throw new Error(`Apify task input sync failed with ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }

  console.log(
    `Synced batch ${batchIndex + 1}/${hiringPostCompanyBatches.length} `
    + `(${input.authorsCompanies.length}/${hiringPostCompanyCount} companies)`
    + `${existingIndex < 0 ? " — no batch recognised, cycle restarted" : " — cycle position preserved"}.\n`
    + `${input.searchQueries.length} search queries x ${input.maxPosts} posts each. `
    + `The webhook rotates the next batch; full cycle: ${hiringPostCompanyCycleHours}h.\n`
    + `Projected ceiling: ${projectedMonthlyPostMaximum().toLocaleString("en-US")} posts/month.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
