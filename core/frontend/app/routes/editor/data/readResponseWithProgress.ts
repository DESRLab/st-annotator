import type { DownloadProgressListener } from "./DataLoader";

/** Reads a response body while reporting received bytes. */
export async function readResponseArrayBuffer(
  response: Response,
  onProgress?: DownloadProgressListener,
): Promise<ArrayBuffer> {
  const totalHeader = response.headers.get("Content-Length");
  const parsedTotal = totalHeader == null ? NaN : Number(totalHeader);
  const totalBytes =
    Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : null;
  if (response.body == null) {
    const buffer = await response.arrayBuffer();
    onProgress?.({
      loadedBytes: buffer.byteLength,
      totalBytes: totalBytes ?? buffer.byteLength,
    });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress?.({ loadedBytes, totalBytes });
  }

  const bytes = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress?.({ loadedBytes, totalBytes: totalBytes ?? loadedBytes });
  return bytes.buffer;
}

/** Reads and parses a JSON response while reporting received bytes. */
export async function readResponseJson<T>(
  response: Response,
  onProgress?: DownloadProgressListener,
): Promise<T> {
  const buffer = await readResponseArrayBuffer(response, onProgress);
  return JSON.parse(new TextDecoder().decode(buffer)) as T;
}

/** Combines progress from concurrent response bodies into one byte counter. */
export function aggregateDownloadProgress(
  count: number,
  onProgress?: DownloadProgressListener,
): readonly DownloadProgressListener[] {
  const values = Array.from({ length: count }, () => ({
    loadedBytes: 0,
    totalBytes: null as number | null,
  }));
  return values.map((_value, index) => (progress) => {
    values[index] = progress;
    const allTotalsKnown = values.every(({ totalBytes }) => totalBytes != null);
    onProgress?.({
      loadedBytes: values.reduce((sum, value) => sum + value.loadedBytes, 0),
      totalBytes: allTotalsKnown
        ? values.reduce((sum, value) => sum + (value.totalBytes ?? 0), 0)
        : null,
    });
  });
}
