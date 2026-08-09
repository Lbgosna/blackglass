import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkD1Fixtures, checkDocumentation, localMarkdownTargets } from "./check-docs.mjs";

const fixtureKinds = new Map([
  ["normalization.json", "normalization"],
  ["scope-comparison.json", "scope-comparison"],
  ["resolution-snapshot.json", "resolution-snapshot"],
  ["warning-flow.json", "warning-flow"],
]);

async function writeFixtureSuite(root) {
  const fixtureDirectory = path.join(root, "docs", "architecture", "fixtures", "d1");
  await mkdir(fixtureDirectory, { recursive: true });

  let caseNumber = 0;
  for (const [fileName, kind] of fixtureKinds) {
    caseNumber += 1;
    await writeFile(
      path.join(fixtureDirectory, fileName),
      `${JSON.stringify(
        {
          fixtureVersion: 1,
          normalizationProfile: "d1-v1",
          kind,
          cases: [
            {
              id: `d1.test.case-${caseNumber}`,
              description: "Synthetic reserved fixture case.",
              given: { target: `target-${caseNumber}.test`, address: `192.0.2.${caseNumber}` },
              expected: { accepted: true },
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return fixtureDirectory;
}

test("extracts only local Markdown targets", () => {
  assert.deepEqual(
    localMarkdownTargets(
      "[local](./guide.md) [section](#one) [web](https://example.test) [mail](mailto:test@example.test)",
    ),
    ["./guide.md"],
  );
});

test("reports missing local links", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "blackglass-docs-"));
  await writeFile(path.join(root, "README.md"), "[missing](./missing.md)\n", "utf8");

  assert.deepEqual(await checkDocumentation(root), [
    "README.md: missing local link target ./missing.md",
  ]);
});

test("accepts links to existing files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "blackglass-docs-"));
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, "README.md"), "[guide](./docs/guide.md)\n", "utf8");
  await writeFile(path.join(root, "docs/guide.md"), "# Guide\n", "utf8");

  assert.deepEqual(await checkDocumentation(root), []);
});

test("reports review metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "blackglass-docs-"));
  await writeFile(path.join(root, "README.md"), "Reference studied: example\n", "utf8");

  const errors = await checkDocumentation(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /review\/source metadata/);
});

test("accepts a complete reserved D1 fixture suite through the documentation check", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "blackglass-docs-"));
  await writeFixtureSuite(root);

  assert.deepEqual(await checkD1Fixtures(root), []);
  assert.deepEqual(await checkDocumentation(root), []);
});

test("reports fixture version, shape, and duplicate case IDs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "blackglass-docs-"));
  const fixtureDirectory = await writeFixtureSuite(root);
  const scopePath = path.join(fixtureDirectory, "scope-comparison.json");
  const scopeFixture = JSON.parse(await readFile(scopePath, "utf8"));
  scopeFixture.fixtureVersion = 2;
  scopeFixture.cases[0].id = "d1.test.case-1";
  delete scopeFixture.cases[0].expected;
  await writeFile(scopePath, `${JSON.stringify(scopeFixture, null, 2)}\n`, "utf8");

  const errors = await checkD1Fixtures(root);
  assert.ok(errors.some((error) => error.includes("fixtureVersion must be 1")));
  assert.ok(errors.some((error) => error.includes("duplicates d1.test.case-1")));
  assert.ok(errors.some((error) => error.includes("exactly one of expected or error")));
});

test("reports malformed JSON and a missing required fixture", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "blackglass-docs-"));
  const fixtureDirectory = path.join(root, "docs", "architecture", "fixtures", "d1");
  await mkdir(fixtureDirectory, { recursive: true });
  await writeFile(path.join(fixtureDirectory, "normalization.json"), "{\n", "utf8");

  const errors = await checkD1Fixtures(root);
  assert.ok(errors.some((error) => error.includes("normalization.json: invalid JSON")));
  assert.ok(errors.some((error) => error.includes("warning-flow.json: missing required")));
});

test("reports secret-bearing fields and non-reserved target content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "blackglass-docs-"));
  const fixtureDirectory = await writeFixtureSuite(root);
  const warningPath = path.join(fixtureDirectory, "warning-flow.json");
  const warningFixture = JSON.parse(await readFile(warningPath, "utf8"));
  warningFixture.cases[0].given.password = "synthetic-fixture-value";
  warningFixture.cases[0].given.target = "host.example.org";
  warningFixture.cases[0].given.address = "ff02::1";
  await writeFile(warningPath, `${JSON.stringify(warningFixture, null, 2)}\n`, "utf8");

  const errors = await checkD1Fixtures(root);
  assert.ok(errors.some((error) => error.includes("forbidden secret-bearing field password")));
  assert.ok(errors.some((error) => error.includes("non-reserved hostname host.example.org")));
  assert.ok(errors.some((error) => error.includes("non-documentation IPv6 address ff02::1")));
});
