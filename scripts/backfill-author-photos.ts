import { runPhotoBackfillFromEnv } from "../src/features/hiring-posts/photo-backfill";

async function main() {
  const result = await runPhotoBackfillFromEnv();
  console.log(
    `Scanned ${result.scannedRuns} runs; patched ${result.patched} posts with author photos.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
