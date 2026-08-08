import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ignoredDirectories = new Set([".git", "node_modules"]);

export const forbiddenMetaPatterns = [
  /what was learned/i,
  /reference studied/i,
  /proposed amendments/i,
  /legacy working tree/i,
];

export function localMarkdownTargets(markdown) {
  const targets = [];
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

  for (const match of markdown.matchAll(linkPattern)) {
    const rawTarget = match[1].trim();
    if (
      rawTarget.length === 0 ||
      rawTarget.startsWith("#") ||
      /^(?:https?:|mailto:)/i.test(rawTarget)
    ) {
      continue;
    }

    const target = rawTarget.split("#", 1)[0];
    if (target.length > 0) targets.push(target);
  }

  return targets;
}

async function markdownFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function checkDocumentation(repositoryRoot) {
  const errors = [];

  for (const file of await markdownFiles(repositoryRoot)) {
    const relativeFile = path.relative(repositoryRoot, file);
    const markdown = await readFile(file, "utf8");

    for (const pattern of forbiddenMetaPatterns) {
      if (pattern.test(markdown)) {
        errors.push(`${relativeFile}: contains review/source metadata matching ${pattern}`);
      }
    }

    for (const target of localMarkdownTargets(markdown)) {
      const resolvedTarget = path.resolve(path.dirname(file), target);
      if (!(await exists(resolvedTarget))) {
        errors.push(`${relativeFile}: missing local link target ${target}`);
      }
    }
  }

  return errors;
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const errors = await checkDocumentation(repositoryRoot);

  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
    return;
  }

  console.log("Documentation check passed.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
