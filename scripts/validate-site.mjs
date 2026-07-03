import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appStoreUrl = "https://apps.apple.com/us/app/step-outside/id6758236701";
const htmlFiles = [];
const errors = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      htmlFiles.push(fullPath);
    }
  }
}

function rel(file) {
  return path.relative(root, file);
}

function idsFor(html) {
  return new Set(
    [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]),
  );
}

function hrefsFor(html) {
  return [...html.matchAll(/\shref=["']([^"']+)["']/g)].map((match) => match[1]);
}

function localTargetFor(file, href) {
  const [rawTarget, hash = ""] = href.split("#");
  if (!rawTarget) {
    return { fileTarget: file, hash };
  }

  const resolved = path.resolve(path.dirname(file), rawTarget);
  const fileTarget = rawTarget.endsWith("/")
    ? path.join(resolved, "index.html")
    : resolved;

  return { fileTarget, hash };
}

walk(root);

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");

  for (const href of hrefsFor(html)) {
    if (
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      continue;
    }

    const { fileTarget, hash } = localTargetFor(file, href);
    if (!existsSync(fileTarget)) {
      errors.push(`${rel(file)} links to missing file: ${href}`);
      continue;
    }

    if (hash) {
      const targetHtml = readFileSync(fileTarget, "utf8");
      if (!idsFor(targetHtml).has(hash)) {
        errors.push(`${rel(file)} links to missing anchor: ${href}`);
      }
    }
  }
}

const homepage = readFileSync(path.join(root, "index.html"), "utf8");
const title = homepage.match(/<title>(.*?)<\/title>/)?.[1]?.trim() || "";
const description =
  homepage.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/)
    ?.[1]
    ?.trim() || "";

if (!title.includes("Step Outside") || title.length < 30) {
  errors.push("Homepage SEO title is missing or too short.");
}

if (!description.includes("daily outdoor habit") || description.length < 80) {
  errors.push("Homepage SEO description is missing the current positioning.");
}

if (!homepage.includes(appStoreUrl)) {
  errors.push("Homepage is missing the App Store download link.");
}

for (const id of ["features", "challenges", "community", "pro", "about", "download"]) {
  if (!idsFor(homepage).has(id)) {
    errors.push(`Homepage is missing #${id}.`);
  }
}

if (!homepage.includes("not live yet")) {
  errors.push("Roadmap section must clearly say planned features are not live yet.");
}

if (!homepage.includes("Preview placeholders")) {
  errors.push("App preview placeholders should be clearly marked as replaceable.");
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${htmlFiles.length} HTML files.`);
