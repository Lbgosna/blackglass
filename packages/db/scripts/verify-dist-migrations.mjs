import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { openEngagementDatabase } from "../dist/database.js";

const dataDirectory = mkdtempSync(
  path.join(tmpdir(), "blackglass-db-dist-migration-"),
);
chmodSync(dataDirectory, 0o700);

try {
  const database = openEngagementDatabase({ dataDirectory });
  try {
    const tables = database.sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' order by name",
      )
      .pluck()
      .all();
    if (!tables.includes("engagements") || !tables.includes("scope_revisions")) {
      throw new Error("Built package did not resolve or apply its migrations.");
    }
  } finally {
    database.close();
  }
} finally {
  rmSync(dataDirectory, { recursive: true, force: true });
}
