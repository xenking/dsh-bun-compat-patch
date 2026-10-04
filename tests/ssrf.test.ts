import { describe, expect, it } from "bun:test";
import { isPrivateOrBlockedIp, validateUrlForSsrf, SsrfBlockedError } from "../src/ssrf-filter.ts";

describe("SSRF filter & cloud metadata guard", () => {
  it("detects and blocks cloud metadata IP (169.254.169.254)", () => {
    expect(isPrivateOrBlockedIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrBlockedIp("169.254.1.1")).toBe(true);
  });

  it("detects and blocks loopback and private IPv4 ranges", () => {
    expect(isPrivateOrBlockedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrBlockedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrBlockedIp("172.16.0.1")).toBe(true);
    expect(isPrivateOrBlockedIp("192.168.1.1")).toBe(true);
    expect(isPrivateOrBlockedIp("0.0.0.0")).toBe(true);
  });

  it("detects and blocks IPv6 loopback and private ranges", () => {
    expect(isPrivateOrBlockedIp("::1")).toBe(true);
    expect(isPrivateOrBlockedIp("fe80::1")).toBe(true);
    expect(isPrivateOrBlockedIp("fc00::1")).toBe(true);
  });

  it("allows public IPv4 and IPv6", () => {
    expect(isPrivateOrBlockedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrBlockedIp("1.1.1.1")).toBe(false);
    expect(isPrivateOrBlockedIp("2606:4700:4700::1111")).toBe(false);
  });

  it("rejects non-HTTP protocols", async () => {
    expect(validateUrlForSsrf("file:///etc/passwd")).rejects.toThrow(SsrfBlockedError);
    expect(validateUrlForSsrf("ftp://example.com")).rejects.toThrow(SsrfBlockedError);
  });

  it("rejects localhost and cloud metadata URLs", async () => {
    expect(validateUrlForSsrf("http://169.254.169.254/latest/meta-data")).rejects.toThrow(SsrfBlockedError);
    expect(validateUrlForSsrf("http://127.0.0.1:8088/admin")).rejects.toThrow(SsrfBlockedError);
    expect(validateUrlForSsrf("http://localhost:3000")).rejects.toThrow(SsrfBlockedError);
  });

  it("allows valid public URLs", async () => {
    const res = await validateUrlForSsrf("https://api.github.com");
    expect(res.url.hostname).toBe("api.github.com");
    expect(res.resolvedIps.length).toBeGreaterThan(0);
  });
});
