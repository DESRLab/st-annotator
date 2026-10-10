import { handleFileDownload } from "./files";

import type { Route } from "./+types/files-download";

/**
 * Streams a file or archive without rendering an SSR document.
 *
 * This resource route intentionally lives outside the protected UI layout so
 * React Router returns the raw stream. It does not bypass authorization:
 * `handleFileDownload` requires a valid session with the data-manager role
 * before forwarding the request to the backend.
 */
export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
  const url = new URL(request.url);
  return handleFileDownload(
    request,
    url.searchParams.getAll("download_path"),
    url.searchParams.get("archive") === "true",
  );
}
