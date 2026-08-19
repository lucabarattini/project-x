import { type NetworkContact, parseCsv } from "./contacts";

export type PendingContactRows = {
  rows: string[][];
  source: NetworkContact["source"];
};

export type ContactColumnKey =
  | "fullName"
  | "lastName"
  | "currentCompany"
  | "pastCompanies"
  | "currentTitle"
  | "linkedinUrl"
  | "email";

export const contactMappingFields: Array<{
  key: ContactColumnKey;
  label: string;
  required: boolean;
}> = [
  { key: "fullName", label: "Full Name", required: true },
  { key: "lastName", label: "Last Name", required: false },
  { key: "currentCompany", label: "Current Company", required: false },
  { key: "pastCompanies", label: "Past Companies", required: false },
  { key: "currentTitle", label: "Current Title", required: false },
  { key: "linkedinUrl", label: "LinkedIn URL", required: false },
  { key: "email", label: "Email", required: false },
];

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

export async function rowsFromFile(file: File) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    return parseCsv(await readFileAsText(file));
  }

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readFileAsArrayBuffer(file));
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: string[][] = [];
  worksheet.eachRow((row) => {
    const values = Array.isArray(row.values) ? row.values : [];
    rows.push(
      values
        .slice(1)
        .map((value) => (value === null || value === undefined ? "" : String(value))),
    );
  });
  return rows;
}
