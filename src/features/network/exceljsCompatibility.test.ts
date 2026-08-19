import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

test("ExcelJS writes and reads XLSX files with the secure UUID override", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Contacts");
  worksheet.addRow(["Name", "Score"]);
  worksheet.addRow(["Ada Lovelace", 3]);

  // A non-gradient data bar exercises ExcelJS's UUID-backed extended rule path.
  worksheet.addConditionalFormatting({
    ref: "B2:B2",
    rules: [
      {
        type: "dataBar",
        priority: 1,
        gradient: false,
        cfvo: [{ type: "min" }, { type: "max" }],
      },
    ],
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const importedWorkbook = new ExcelJS.Workbook();
  await importedWorkbook.xlsx.load(buffer);

  assert.equal(importedWorkbook.getWorksheet("Contacts")?.getCell("A2").value, "Ada Lovelace");
});
