import fs from "node:fs";
import path from "node:path";

const DEPLOYED_BUILD_HASH_PATH = path.resolve(
  process.cwd(),
  "build/client/build-hash.txt",
);

function rejectServing(message: string): never {
  // React Router uses thrown Responses to preserve HTTP status and headers.
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw new Response(message, {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": "5",
    },
  });
}

/** Rejects requests when the running SSR bundle and deployed client differ. */
export function assertCurrentBuild(
  expectedBuildHash?: string,
  deployedBuildHashPath = DEPLOYED_BUILD_HASH_PATH,
) {
  if (!expectedBuildHash) return;

  let deployedBuildHash: string;
  try {
    deployedBuildHash = fs.readFileSync(deployedBuildHashPath, "utf8").trim();
  } catch {
    rejectServing("The frontend build is unavailable. Retry shortly.");
  }

  if (deployedBuildHash !== expectedBuildHash) {
    rejectServing("The frontend deployment is being updated. Retry shortly.");
  }
}
