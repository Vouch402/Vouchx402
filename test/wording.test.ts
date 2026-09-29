import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Hard requirement 8 (language): what the server does on the standard
 * `exact` path is "settle the payer's signed payment to our own
 * treasury". Vouch402 is never called a "facilitator", and nothing it
 * does is called "facilitation", in any public copy. Matches the
 * Spanish forms too (facilitador, facilitación, facilita...).
 *
 * Exempt: the /legal pages. Their LFPIORPI analysis has to quote the
 * statute's own terms ("facilitación o intermediación", Art. 24 Bis 4
 * of Acuerdo 115/2026) precisely to argue Vouch402 falls outside them;
 * rewording that is a legal-review decision, not a copy change.
 */
const ROOT = path.join(__dirname, "..");
const SCOPE = ["web/messages", "web/content", "README.md", "docs"];
const EXEMPT = new Set(["web/content/legal-en.md", "web/content/legal-es.md"]);

function filesUnder(rel: string): string[] {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [rel];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .flatMap((e) => filesUnder(path.posix.join(rel, e.name)));
}

describe("hard requirement 8: no \"facilitator\"/\"facilitation\" wording in public copy", () => {
  it("never appears in web/messages, web/content, README.md or docs/ (legal pages exempt)", () => {
    const files = SCOPE.flatMap(filesUnder).filter((f) => !EXEMPT.has(f));
    // The scan actually reached the files it's meant to guard.
    expect(files).toEqual(
      expect.arrayContaining(["README.md", "docs/TECHNICAL_SPEC.md", "web/messages/en.json", "web/messages/es.json", "web/content/technical-spec.md"])
    );
    const hits = files.flatMap((f) =>
      fs
        .readFileSync(path.join(ROOT, f), "utf8")
        .split(/\r?\n/)
        .map((line, i) => ({ f, line: i + 1, text: line.trim() }))
        .filter(({ text }) => /facilit/i.test(text))
        .map(({ f, line, text }) => `${f}:${line}: ${text.slice(0, 120)}`)
    );
    expect(hits).toEqual([]);
  });
});
