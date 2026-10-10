/** Generates the untracked identity shared by one frontend production build. */

import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const frontendDir = path.resolve(process.argv[2]);
const buildHash = randomBytes(32).toString("hex");

await writeFile(
  path.join(frontendDir, "public", "build-hash.txt"),
  `${buildHash}\n`,
);
