import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = join(projectRoot, "dist");
const dateParts = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());
const month = dateParts.find(({ type }) => type === "month")?.value;
const day = dateParts.find(({ type }) => type === "day")?.value;
if (!month || !day) {
  throw new Error("Unable to determine the package date.");
}
const archivePrefix = `yellow-match-${month}${day}-`;
const existingVersions = (await readdir(projectRoot)).flatMap((name) => {
  if (!name.startsWith(archivePrefix)) return [];
  const match = /^(\d+)\.zip$/.exec(name.slice(archivePrefix.length));
  return match ? [Number(match[1])] : [];
});
const nextVersion = Math.max(0, ...existingVersions) + 1;
const archivePath = join(projectRoot, `${archivePrefix}${nextVersion}.zip`);
const forbiddenNames = new Set([".DS_Store", "__MACOSX", "toy.yaml"]);
const allowedExternalReferences = new Set(["//s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js"]);

async function collectFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (forbiddenNames.has(entry.name)) {
      throw new Error(`Forbidden upload entry: ${relative(distDirectory, join(directory, entry.name))}`);
    }
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function assertRelativeReference(reference, source) {
  if (/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(reference) && !allowedExternalReferences.has(reference)) {
    throw new Error(`Non-relative asset reference in ${source}: ${reference}`);
  }
}

const indexPath = join(distDirectory, "index.html");
const indexHtml = await readFile(indexPath, "utf8").catch(() => {
  throw new Error("dist/index.html is missing. Run the production build before packaging.");
});

for (const match of indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
  assertRelativeReference(match[1], "index.html");
}

const outputFiles = await collectFiles(distDirectory);
for (const filePath of outputFiles) {
  if (!/\.(?:css|html|js)$/i.test(filePath)) {
    continue;
  }
  const source = relative(distDirectory, filePath);
  const contents = await readFile(filePath, "utf8");
  for (const match of contents.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    assertRelativeReference(match[1], source);
  }
  for (const match of contents.matchAll(/new URL\(["']([^"']+)["']/g)) {
    assertRelativeReference(match[1], source);
  }
}

await executeFile("zip", ["-q", "-r", archivePath, "."], { cwd: distDirectory });

const archiveStats = await stat(archivePath);
console.log(`Created ${relative(projectRoot, archivePath)} (${(archiveStats.size / 1024).toFixed(1)} KiB)`);
