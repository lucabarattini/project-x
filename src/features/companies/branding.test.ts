import assert from "node:assert/strict";
import test from "node:test";
import { companyDomain, companyLogoPath } from "./branding.ts";

test("company branding resolves canonical company names", () => {
  assert.equal(companyLogoPath("Amazon"), "/company-logos/amazon.png");
  assert.equal(companyLogoPath("Clay"), "/company-logos/clay.png");
  assert.equal(companyLogoPath("Point72"), "/company-logos/point72.png");
  assert.equal(companyLogoPath("Fal"), "/company-logos/fal.png");
  assert.equal(companyLogoPath("Fireworks AI"), "/company-logos/fireworksai.png");
  assert.equal(companyLogoPath("Gamma"), "/company-logos/gamma.png");
  assert.equal(companyLogoPath("Listen Labs"), "/company-logos/listenlabs.png");
  assert.equal(companyLogoPath("Mercor"), "/company-logos/mercor.png");
  assert.equal(companyLogoPath("Midjourney"), "/company-logos/midjourney.png");
  assert.equal(companyLogoPath("Wispr Flow"), "/company-logos/wisprflow.png");
});

test("company branding resolves common provider name variants", () => {
  assert.equal(companyLogoPath("Amazon.com"), "/company-logos/amazon.png");
  assert.equal(companyLogoPath("Clay Labs"), "/company-logos/clay.png");
  assert.equal(
    companyLogoPath("Point72 Asset Management"),
    "/company-logos/point72.png",
  );
  assert.equal(companyDomain("Google LLC"), "google.com");
  assert.equal(companyLogoPath("Google LLC"), "/company-logos/google.svg");
});

test("company branding returns null for unknown companies", () => {
  assert.equal(companyLogoPath("Not A Real Company"), null);
});
