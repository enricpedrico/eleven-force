import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error This maintenance helper is plain JavaScript.
import { downloadTrusted } from "../scripts/safe-download.mjs";

afterEach(() => vi.unstubAllGlobals());
describe("catalog download boundary", () => {
  it("rejects untrusted hosts, credentials and ports before making a request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const url of ["http://assets.example/x", "https://other.example/x", "https://u:p@assets.example/x", "https://assets.example:8443/x"]) {
      await expect(downloadTrusted(url, "assets.example", 100)).rejects.toThrow("Rejected download origin");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("disallows redirects and returns bounded content", async () => {
    const fetcher = vi.fn(async () => new Response("ok")); vi.stubGlobal("fetch", fetcher);
    const bytes = await downloadTrusted("https://assets.example/x", "assets.example", 10);
    expect(new TextDecoder().decode(bytes)).toBe("ok");
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
  });
  it("stops oversized chunked responses even without a Content-Length header", async () => {
    let canceled = false;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); },
      cancel() { canceled = true; },
    }))));
    await expect(downloadTrusted("https://assets.example/x", "assets.example", 10)).rejects.toThrow("Download too large");
    expect(canceled).toBe(true);
  });
});
