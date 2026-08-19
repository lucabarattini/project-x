import ashbyBoards from "../data/ashby-boards.json" with { type: "json" };
import amazonBoards from "../data/amazon-boards.json" with { type: "json" };
import googleBoards from "../data/google-boards.json" with { type: "json" };
import greenhouseBoards from "../data/greenhouse-boards.json" with { type: "json" };
import leverBoards from "../data/lever-boards.json" with { type: "json" };
import targets from "../data/target-companies.json" with { type: "json" };
import workdayBoards from "../data/workday-boards.json" with { type: "json" };
import customBoards from "../data/custom-careers-boards.json" with { type: "json" };

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const boards = [
  ...greenhouseBoards,
  ...ashbyBoards,
  ...leverBoards,
  ...workdayBoards,
  ...amazonBoards,
  ...googleBoards,
  ...customBoards,
];
const covered = new Set(boards.map((board) => normalize(board.company)));
const rows = targets.map((target) => ({
  ...target,
  covered: covered.has(normalize(target.company)),
}));

const missing = rows.filter((row) => !row.covered);
const highPriorityMissing = missing.filter((row) => row.priority === "high");

console.log(`Covered: ${rows.length - missing.length}/${rows.length}`);
console.log(`Missing: ${missing.length}`);
console.log(`High-priority missing: ${highPriorityMissing.length}`);
console.log("");
console.log("High-priority missing companies:");
for (const row of highPriorityMissing) {
  console.log(`- ${row.company} (${row.source})`);
}

console.log("");
console.log("All missing target companies:");
for (const row of missing) {
  console.log(`- ${row.company} [${row.priority}] (${row.source})`);
}
