// Used only by the catalog maintenance CLI, never by the public HTTP API.
export async function downloadTrusted(source, hostname, maxBytes, contentType) {
  const url = new URL(source);
  if (url.protocol !== "https:" || url.hostname !== hostname || (url.port && url.port !== "443") || url.username || url.password) {
    throw new Error("Rejected download origin");
  }
  const response = await fetch(url, {
    redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "ElevenForceCatalogSync/1.0 (non-commercial fan project)" },
  });
  if (!response.ok || !response.body) throw new Error("Download failed");
  if (contentType && response.headers.get("content-type")?.split(";")[0] !== contentType) {
    await response.body.cancel(); throw new Error("Unexpected content type");
  }
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body.cancel(); throw new Error("Download too large");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Download too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
