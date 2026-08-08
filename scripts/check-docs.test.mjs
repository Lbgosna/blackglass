import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkDocumentation, localMarkdownTargets } from "./check-docs.mjs";

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
