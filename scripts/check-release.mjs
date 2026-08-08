import { access, readFile } from "node:fs/promises";

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (tag === undefined || tag.length === 0) {
  throw new Error("A release tag is required.");
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));
const versionsMatch = versions[manifest.version] === manifest.minAppVersion;
if (packageJson.version !== manifest.version || manifest.version !== tag || !versionsMatch) {
  throw new Error(
    `Release mismatch: tag=${tag}, package=${packageJson.version}, manifest=${manifest.version}`
  );
}

await Promise.all(["main.js", "manifest.json", "styles.css"].map((path) => access(path)));
