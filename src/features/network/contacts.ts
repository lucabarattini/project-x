export type NetworkContact = {
  id: string;
  fullName: string;
  currentCompany: string | null;
  pastCompanies: string[];
  currentTitle: string | null;
  linkedinUrl: string | null;
  email: string | null;
  source: "crm" | "linkedin-export";
};

export type ContactImportState = {
  contacts: NetworkContact[];
  importedAt: string | null;
  aliases: Record<string, string[]>;
};

export type CompanyMatch = {
  contact: NetworkContact;
  relationship: "Currently At" | "Previously At";
  matchReason: "current company exact" | "current company alias" | "former company exact" | "former company alias";
};

export type ContactColumnMap = {
  fullName: number;
  lastName?: number;
  currentCompany?: number;
  pastCompanies?: number;
  currentTitle?: number;
  linkedinUrl?: number;
  email?: number;
};

const databaseName = "a-better-linkedin-network";
const storeName = "contact-state";
const stateKey = "current";

const defaultAliases: Record<string, string[]> = {
  "Google": ["Alphabet"],
  "Meta": ["Facebook"],
  "OpenAI": ["Open AI"],
  "Jane Street": ["Jane Street Capital"],
  "Tower Research Capital": ["Tower Research"],
  "Virtu Financial": ["Virtu"],
  "Safe Superintelligence": ["SSI"],
  "Thinking Machines Lab": ["Thinking Machines"],
};

function normalizeCompany(value: string) {
  return value
    .toLowerCase()
    .replace(/&/gu, "and")
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b\.?/giu, "")
    .replace(/[^a-z0-9]+/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function readContactState(): Promise<ContactImportState> {
  const database = await openDatabase();
  return new Promise<ContactImportState>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(stateKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(
        request.result ?? {
          contacts: [],
          importedAt: null,
          aliases: defaultAliases,
        },
      );
    };
  }).finally(() => database.close());
}

export async function writeContactState(state: ContactImportState) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const request = transaction.objectStore(storeName).put(state, stateKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  }).finally(() => database.close());
}

export async function clearContactState() {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const request = transaction.objectStore(storeName).delete(stateKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  }).finally(() => database.close());
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function findColumn(headers: string[], candidates: RegExp[]) {
  return headers.findIndex((header) => candidates.some((candidate) => candidate.test(header)));
}

export function normalizeContacts(rows: string[][], source: NetworkContact["source"]): NetworkContact[] {
  const [headers = [], ...records] = rows;
  const normalizedHeaders = headers.map((header) => header.toLowerCase().trim());
  const fullNameIndex = findColumn(normalizedHeaders, [/^name$/u, /full.*name/u]);
  const firstNameIndex = findColumn(normalizedHeaders, [/first.*name/u, /^nome$/u]);
  const lastNameIndex = findColumn(normalizedHeaders, [/last.*name/u, /surname/u, /^cognome$/u]);
  const nameIndex = fullNameIndex >= 0 ? fullNameIndex : firstNameIndex;
  const companyIndex = findColumn(normalizedHeaders, [/company/u, /organization/u, /current.*company/u, /azienda/u]);
  const pastCompanyIndex = findColumn(normalizedHeaders, [/past.*compan/u, /former.*compan/u, /previous.*compan/u]);
  const titleIndex = findColumn(normalizedHeaders, [/title/u, /position/u, /headline/u]);
  const linkedinIndex = findColumn(normalizedHeaders, [/linkedin/u, /profile.*url/u]);
  const emailIndex = findColumn(normalizedHeaders, [/email/u, /^mail$/u]);

  if (nameIndex < 0) {
    throw new Error("Column mapping required: could not identify a name column.");
  }

  return records
    .map((record, index) =>
      contactFromRecord(record, index, source, {
        fullName: nameIndex,
        lastName: fullNameIndex < 0 && lastNameIndex >= 0 ? lastNameIndex : undefined,
        currentCompany: companyIndex >= 0 ? companyIndex : undefined,
        pastCompanies: pastCompanyIndex >= 0 ? pastCompanyIndex : undefined,
        currentTitle: titleIndex >= 0 ? titleIndex : undefined,
        linkedinUrl: linkedinIndex >= 0 ? linkedinIndex : undefined,
        email: emailIndex >= 0 ? emailIndex : undefined,
      }),
    )
    .filter((contact) => contact.fullName);
}

function optionalCell(record: string[], index: number | undefined) {
  return index === undefined ? "" : (record[index] ?? "");
}

function contactFromRecord(
  record: string[],
  index: number,
  source: NetworkContact["source"],
  columnMap: ContactColumnMap,
): NetworkContact {
  const firstOrFullName = record[columnMap.fullName]?.trim() ?? "";
  const lastName = optionalCell(record, columnMap.lastName).trim();
  const fullName = [firstOrFullName, lastName].filter(Boolean).join(" ");
  const currentCompany = optionalCell(record, columnMap.currentCompany).trim() || null;
  const pastCompanies = optionalCell(record, columnMap.pastCompanies)
    .split(/[;|]/u)
    .map((company) => company.trim())
    .filter(Boolean);

  return {
    id: `${source}-${fullName}-${currentCompany ?? "unknown"}-${index}`,
    fullName,
    currentCompany,
    pastCompanies,
    currentTitle: optionalCell(record, columnMap.currentTitle).trim() || null,
    linkedinUrl: optionalCell(record, columnMap.linkedinUrl).trim() || null,
    email: optionalCell(record, columnMap.email).trim() || null,
    source,
  };
}

export function normalizeContactsWithColumnMap(
  rows: string[][],
  source: NetworkContact["source"],
  columnMap: ContactColumnMap,
) {
  const records = rows.slice(1);
  return records
    .map((record, index) => contactFromRecord(record, index, source, columnMap))
    .filter((contact) => contact.fullName);
}

function companyAliases(company: string, aliases: Record<string, string[]>) {
  const configured = aliases[company] ?? [];
  return [company, ...configured].map(normalizeCompany);
}

export function matchContactsForCompany(
  company: string,
  contacts: NetworkContact[],
  aliases: Record<string, string[]> = defaultAliases,
) {
  const targets = new Set(companyAliases(company, aliases));
  const matches: CompanyMatch[] = [];

  for (const contact of contacts) {
    const current = contact.currentCompany ? normalizeCompany(contact.currentCompany) : null;
    if (current && targets.has(current)) {
      matches.push({ contact, relationship: "Currently At", matchReason: "current company exact" });
      continue;
    }

    const currentAliases = contact.currentCompany ? companyAliases(contact.currentCompany, aliases) : [];
    if (currentAliases.some((alias) => targets.has(alias))) {
      matches.push({ contact, relationship: "Currently At", matchReason: "current company alias" });
      continue;
    }

    const formerExact = contact.pastCompanies.some((pastCompany) => targets.has(normalizeCompany(pastCompany)));
    if (formerExact) {
      matches.push({ contact, relationship: "Previously At", matchReason: "former company exact" });
      continue;
    }

    const formerAlias = contact.pastCompanies.some((pastCompany) =>
      companyAliases(pastCompany, aliases).some((alias) => targets.has(alias)),
    );
    if (formerAlias) {
      matches.push({ contact, relationship: "Previously At", matchReason: "former company alias" });
    }
  }

  return matches.sort((left, right) =>
    left.relationship === right.relationship
      ? left.contact.fullName.localeCompare(right.contact.fullName)
      : left.relationship === "Currently At"
        ? -1
        : 1,
  );
}

export function initialContactState(): ContactImportState {
  return {
    contacts: [],
    importedAt: null,
    aliases: defaultAliases,
  };
}
