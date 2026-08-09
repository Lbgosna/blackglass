import { readdir, readFile, stat } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { domainToASCII, fileURLToPath } from "node:url";

const ignoredDirectories = new Set([".git", "node_modules"]);
const d1FixtureVersion = 1;
const d1NormalizationProfile = "d1-v1";
const d1FixtureFiles = new Map([
  ["normalization.json", "normalization"],
  ["scope-comparison.json", "scope-comparison"],
  ["resolution-snapshot.json", "resolution-snapshot"],
  ["warning-flow.json", "warning-flow"],
]);
const forbiddenFixtureValue =
  /(?:-----BEGIN [A-Z ]+PRIVATE KEY-----|\bbearer\s+\S+|\bsk-[a-z0-9_-]{12,}|\bghp_[a-z0-9]{20,}|\bgithub_pat_[a-z0-9_]{20,}|\bxoxb-[a-z0-9-]{20,})/i;
const ipv4Like = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;
const ipv6Like = /(?<![a-z0-9])(?:[0-9a-f]{0,4}:){2,}[0-9a-f:.]*(?:%25?[a-z0-9._~-]+)?(?:\/\d{1,3})?/gi;
const domainLike = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}\.?/giu;
const singleLabelHostname = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedFieldName(key) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isForbiddenFixtureKey(key) {
  const normalizedKey = normalizedFieldName(key);
  return (
    /(?:secret|token|password|apikey|privatekey|cookie)$/.test(normalizedKey) ||
    normalizedKey === "authorization"
  );
}

function isSingleLabelTargetField(key) {
  return /(?:input|target|hostname|host|queryname|sniname|hostheader)$/.test(
    normalizedFieldName(key),
  );
}

function isTargetBearingField(key) {
  return (
    isSingleLabelTargetField(key) ||
    /(?:url|origin|location|destination)$/.test(normalizedFieldName(key))
  );
}

function documentationIpv4(address) {
  return /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./.test(address);
}

function ipv6Words(address) {
  let expandedAddress = address.toLowerCase();
  if (expandedAddress.includes(".")) {
    const lastColon = expandedAddress.lastIndexOf(":");
    const octets = expandedAddress
      .slice(lastColon + 1)
      .split(".")
      .map((octet) => Number.parseInt(octet, 10));
    expandedAddress = `${expandedAddress.slice(0, lastColon)}:${(
      (octets[0] << 8) |
      octets[1]
    ).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = expandedAddress.split("::");
  const left = halves[0] ? halves[0].split(":").map((word) => Number.parseInt(word, 16)) : [];
  const right = halves[1] ? halves[1].split(":").map((word) => Number.parseInt(word, 16)) : [];
  const zeroCount = halves.length === 2 ? 8 - left.length - right.length : 0;
  return [...left, ...Array.from({ length: zeroCount }, () => 0), ...right];
}

function isReservedFixtureIpv6(address) {
  const words = ipv6Words(address);
  const isMappedIpv4 = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (isMappedIpv4) {
    const mappedAddress = [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff].join(
      ".",
    );
    return documentationIpv4(mappedAddress);
  }

  const isDocumentationAddress = words[0] === 0x2001 && words[1] === 0x0db8;
  const isLinkLocalAddress = (words[0] & 0xffc0) === 0xfe80;
  return isDocumentationAddress || isLinkLocalAddress;
}

function unicodeTargetHostname(value, key) {
  if (!isTargetBearingField(key)) return undefined;

  if (/^https?:\/\//i.test(value)) {
    try {
      const hostname = new URL(value).hostname;
      if (!hostname.startsWith("[") && isIP(hostname) === 0) return hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }

  if (value.includes(".") && /[^\x00-\x7f]/u.test(value)) {
    const hostname = domainToASCII(value.replace(/\.$/, ""));
    if (hostname) return hostname.toLowerCase();
  }

  return undefined;
}

function fixtureContentErrors(value, location, key = "") {
  const errors = [];

  if (isForbiddenFixtureKey(key)) {
    errors.push(`${location}: forbidden secret-bearing field ${key}`);
  }

  if (typeof value === "string") {
    if (forbiddenFixtureValue.test(value)) {
      errors.push(`${location}: contains secret-like content`);
    }

    for (const match of value.matchAll(ipv4Like)) {
      const address = match[0];
      if (!documentationIpv4(address)) {
        errors.push(`${location}: contains non-documentation IPv4 address ${address}`);
      }
    }

    for (const match of value.matchAll(ipv6Like)) {
      const address = match[0].replace(/\/\d{1,3}$/, "").replace(/%25?[a-z0-9._~-]+$/i, "");
      if (isIP(address) === 6 && !isReservedFixtureIpv6(address)) {
        errors.push(`${location}: contains non-documentation IPv6 address ${address}`);
      }
    }

    if (
      isSingleLabelTargetField(key) &&
      singleLabelHostname.test(value) &&
      !/-lab$/i.test(value)
    ) {
      errors.push(`${location}: contains non-synthetic single-label hostname ${value}`);
    }

    const unicodeHostname = unicodeTargetHostname(value, key);
    if (unicodeHostname && !/\.(?:test|example|invalid)$/.test(unicodeHostname)) {
      errors.push(`${location}: contains non-reserved hostname ${unicodeHostname}`);
    }

    if (key !== "id" && key !== "description") {
      for (const match of value.matchAll(domainLike)) {
        const hostname = match[0].replace(/\.$/, "").toLowerCase();
        if (!/\.(?:test|example|invalid)$/.test(hostname)) {
          errors.push(`${location}: contains non-reserved hostname ${match[0]}`);
        }
      }
    }

    return errors;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      errors.push(...fixtureContentErrors(item, `${location}[${index}]`, key));
    }
    return errors;
  }

  if (isRecord(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      errors.push(...fixtureContentErrors(childValue, `${location}.${childKey}`, childKey));
    }
  }

  return errors;
}

export async function checkD1Fixtures(repositoryRoot) {
  const fixtureDirectory = path.join(repositoryRoot, "docs", "architecture", "fixtures", "d1");
  const errors = [];
  const caseIds = new Map();

  if (!(await exists(fixtureDirectory))) {
    return ["docs/architecture/fixtures/d1: missing D1 fixture directory"];
  }

  const fixtureEntries = await readdir(fixtureDirectory, { withFileTypes: true });
  for (const entry of fixtureEntries) {
    if (entry.isFile() && entry.name.endsWith(".json") && !d1FixtureFiles.has(entry.name)) {
      errors.push(`docs/architecture/fixtures/d1/${entry.name}: unexpected D1 fixture file`);
    }
  }

  for (const [fileName, expectedKind] of d1FixtureFiles) {
    const fixturePath = path.join(fixtureDirectory, fileName);
    const relativePath = path.relative(repositoryRoot, fixturePath);

    if (!(await exists(fixturePath))) {
      errors.push(`${relativePath}: missing required D1 fixture file`);
      continue;
    }

    let fixture;
    try {
      fixture = JSON.parse(await readFile(fixturePath, "utf8"));
    } catch (error) {
      errors.push(`${relativePath}: invalid JSON: ${error.message}`);
      continue;
    }

    if (!isRecord(fixture)) {
      errors.push(`${relativePath}: fixture root must be an object`);
      continue;
    }

    if (fixture.fixtureVersion !== d1FixtureVersion) {
      errors.push(`${relativePath}: fixtureVersion must be ${d1FixtureVersion}`);
    }
    if (fixture.normalizationProfile !== d1NormalizationProfile) {
      errors.push(`${relativePath}: normalizationProfile must be ${d1NormalizationProfile}`);
    }
    if (fixture.kind !== expectedKind) {
      errors.push(`${relativePath}: kind must be ${expectedKind}`);
    }
    if (!Array.isArray(fixture.cases) || fixture.cases.length === 0) {
      errors.push(`${relativePath}: cases must be a non-empty array`);
      continue;
    }

    for (const [index, fixtureCase] of fixture.cases.entries()) {
      const caseLocation = `${relativePath}: cases[${index}]`;
      if (!isRecord(fixtureCase)) {
        errors.push(`${caseLocation} must be an object`);
        continue;
      }

      if (typeof fixtureCase.id !== "string" || !/^d1\.[a-z0-9.-]+$/.test(fixtureCase.id)) {
        errors.push(`${caseLocation}.id must be a stable d1 case ID`);
      } else if (caseIds.has(fixtureCase.id)) {
        errors.push(
          `${caseLocation}.id duplicates ${fixtureCase.id} from ${caseIds.get(fixtureCase.id)}`,
        );
      } else {
        caseIds.set(fixtureCase.id, caseLocation);
      }

      if (typeof fixtureCase.description !== "string" || fixtureCase.description.trim() === "") {
        errors.push(`${caseLocation}.description must be a non-empty string`);
      }
      if (!isRecord(fixtureCase.given)) {
        errors.push(`${caseLocation}.given must be an object`);
      }

      const hasExpected = Object.hasOwn(fixtureCase, "expected");
      const hasError = Object.hasOwn(fixtureCase, "error");
      if (hasExpected === hasError) {
        errors.push(`${caseLocation} must contain exactly one of expected or error`);
      } else {
        const outcomeName = hasExpected ? "expected" : "error";
        const outcome = fixtureCase[outcomeName];
        if (!isRecord(outcome) || Object.keys(outcome).length === 0) {
          errors.push(`${caseLocation}.${outcomeName} must be a non-empty object`);
        }
        if (hasError && (typeof outcome?.code !== "string" || outcome.code.trim() === "")) {
          errors.push(`${caseLocation}.error.code must be a non-empty string`);
        }
      }

      errors.push(...fixtureContentErrors(fixtureCase, caseLocation));
    }
  }

  return errors;
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

  const d1FixtureDirectory = path.join(repositoryRoot, "docs", "architecture", "fixtures", "d1");
  const d1AdrPath = path.join(
    repositoryRoot,
    "docs",
    "architecture",
    "0001-target-normalization-scope-warnings.md",
  );
  if ((await exists(d1AdrPath)) || (await exists(d1FixtureDirectory))) {
    errors.push(...(await checkD1Fixtures(repositoryRoot)));
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
