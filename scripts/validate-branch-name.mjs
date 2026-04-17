import { execSync } from "node:child_process";

function readBranchName() {
  try {
    return execSync("git symbolic-ref --short HEAD", {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

const branchName = readBranchName();

if (!branchName || branchName === "HEAD") {
  process.exit(0);
}

if (branchName === "main") {
  console.error("Direct commits to main are blocked. Create a feature/* or fix/* branch first.");
  process.exit(1);
}

if (/^(feature|fix)\/[a-z0-9._-]+$/.test(branchName)) {
  process.exit(0);
}

console.error(
  `Invalid branch name "${branchName}". Use feature/<description> or fix/<description>.`,
);
process.exit(1);
