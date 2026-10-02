import { describe, expect, it, vi } from "vitest";
vi.mock("../config/env", () => ({ env: {
  r2Endpoint: "https://test-account.r2.cloudflarestorage.com",
  r2AccessKeyId: "test-key", r2SecretAccessKey: "test-secret",
  r2BucketName: "audio", r2PublicBaseUrl: "https://audio.example.com",
} }));
import { createAudioUploadUrl } from "./r2-storage";

describe("R2 upload signing", () => {
  it("signs type, exact size and overwrite prevention without unsupported checksums", async () => {
    const url = new URL(await createAudioUploadUrl("announcements/test", "audio/mpeg", 100));
    expect(url.hostname).toContain("r2.cloudflarestorage.com");
    expect(url.pathname).toContain("announcements/test");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    const headers = url.searchParams.get("X-Amz-SignedHeaders")!.split(";");
    expect(headers).toEqual(expect.arrayContaining(["content-type", "content-length", "if-none-match", "host"]));
    expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
  });
});
