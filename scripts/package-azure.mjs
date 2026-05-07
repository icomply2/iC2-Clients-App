import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const buildOutputDirName = ".next-azure";
const buildOutputDir = path.join(root, buildOutputDirName);
const standaloneDir = path.join(buildOutputDir, "standalone");
const staticDir = path.join(buildOutputDir, "static");
const publicDir = path.join(root, "public");
const artifactDir = path.join(root, ".azure_deploy_artifact");
const zipPath = path.join(root, "ic2-clients-app-deploy.local.zip");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function recreateDir(dirPath) {
  rmSync(dirPath, { recursive: true, force: true });
  mkdirSync(dirPath, { recursive: true });
}

function copyDirectoryContents(source, destination) {
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
}

rmSync(buildOutputDir, { recursive: true, force: true });

const buildEnv = {
  ...process.env,
  BUILD_OUTPUT_DIR: buildOutputDirName,
};

run("npx", ["next", "build", "--webpack"], { env: buildEnv });

if (!existsSync(standaloneDir)) {
  throw new Error("Standalone build output was not found after the Azure build.");
}

recreateDir(artifactDir);

copyDirectoryContents(standaloneDir, artifactDir);

const artifactNextDir = path.join(artifactDir, ".next");
const artifactBuildDir = path.join(artifactDir, buildOutputDirName);
mkdirSync(artifactNextDir, { recursive: true });
mkdirSync(artifactBuildDir, { recursive: true });

if (existsSync(staticDir)) {
  copyDirectoryContents(staticDir, path.join(artifactNextDir, "static"));
  copyDirectoryContents(staticDir, path.join(artifactBuildDir, "static"));
}

if (existsSync(publicDir)) {
  copyDirectoryContents(publicDir, path.join(artifactDir, "public"));
}

rmSync(zipPath, { force: true });

run("zip", ["-qr", zipPath, "."], { cwd: artifactDir });

console.log("Azure deploy package created:");
console.log(`  ${zipPath}`);
console.log("");
console.log("App Service startup command:");
console.log("  node server.js");
