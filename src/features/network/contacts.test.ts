import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContacts } from "./contacts.ts";

test("normalizeContacts understands Italian CRM headers and split names", () => {
  const contacts = normalizeContacts(
    [
      ["Nome", "Cognome", "Mail", "LinkedIn", "Azienda"],
      ["Ada", "Lovelace", "ada@example.com", "https://linkedin.com/in/ada", "Analytical Engines"],
      ["Grace", "Hopper", "", "https://linkedin.com/in/grace", ""],
    ],
    "crm",
  );

  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].fullName, "Ada Lovelace");
  assert.equal(contacts[0].currentCompany, "Analytical Engines");
  assert.equal(contacts[0].email, "ada@example.com");
  assert.equal(contacts[1].fullName, "Grace Hopper");
  assert.equal(contacts[1].currentCompany, null);
});
