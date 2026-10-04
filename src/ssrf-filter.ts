import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class SsrfBlockedError extends Error {
  readonly ip?: string;
  readonly hostname: string;

  constructor(message: string, hostname: string, ip?: string) {
    super(message);
    this.name = "SsrfBlockedError";
    this.hostname = hostname;
    this.ip = ip;
  }
}

function ipv4ToInt(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => ((acc << 8) + Number.parseInt(octet, 10)) >>> 0, 0);
}

function inIpv4Range(ipInt: number, cidrBase: string, prefixLen: number): boolean {
  const baseInt = ipv4ToInt(cidrBase);
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function isPrivateOrBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 0) return true;

  if (kind === 4) {
    const n = ipv4ToInt(ip);
    // 0.0.0.0/8 (current network)
    if (inIpv4Range(n, "0.0.0.0", 8)) return true;
    // 10.0.0.0/8 (private)
    if (inIpv4Range(n, "10.0.0.0", 8)) return true;
    // 127.0.0.0/8 (loopback)
    if (inIpv4Range(n, "127.0.0.0", 8)) return true;
    // 169.254.0.0/16 (link-local, cloud metadata 169.254.169.254)
    if (inIpv4Range(n, "169.254.0.0", 16)) return true;
    // 172.16.0.0/12 (private)
    if (inIpv4Range(n, "172.16.0.0", 12)) return true;
    // 192.168.0.0/16 (private)
    if (inIpv4Range(n, "192.168.0.0", 16)) return true;
    // 100.64.0.0/10 (carrier-grade NAT)
    if (inIpv4Range(n, "100.64.0.0", 10)) return true;
    // 224.0.0.0/4 (multicast) & 240.0.0.0/4 (reserved)
    if (inIpv4Range(n, "224.0.0.0", 4) || inIpv4Range(n, "240.0.0.0", 4)) return true;
    // Broadcast
    if (ip === "255.255.255.255") return true;
    return false;
  }

  // IPv6
  const normalized = ip.toLowerCase();
  // Loopback
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  // Unspecified
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;
  // Link-local fe80::/10
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  // Unique local fc00::/7 (fc00 - fdff)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // IPv4-mapped IPv6 (::ffff:127.0.0.1 etc)
  if (normalized.startsWith("::ffff:")) {
    const v4Part = normalized.slice(7);
    if (isIP(v4Part) === 4) return isPrivateOrBlockedIp(v4Part);
  }
  return false;
}

export async function validateUrlForSsrf(
  urlString: string,
  options: { allowPrivate?: boolean } = {},
): Promise<{ url: URL; resolvedIps: string[] }> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SsrfBlockedError(`Invalid URL: ${urlString}`, urlString);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError(
      `Protocol ${parsed.protocol} is forbidden; only http: and https: are allowed`,
      parsed.hostname,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    if (!options.allowPrivate) {
      throw new SsrfBlockedError(`Local hostname blocked: ${hostname}`, hostname);
    }
  }

  // Direct IP in hostname
  if (isIP(hostname) !== 0) {
    if (!options.allowPrivate && isPrivateOrBlockedIp(hostname)) {
      throw new SsrfBlockedError(`Direct IP connection to private/cloud-metadata target blocked: ${hostname}`, hostname, hostname);
    }
    return { url: parsed, resolvedIps: [hostname] };
  }

  // DNS pre-resolution
  try {
    const addresses = await lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new SsrfBlockedError(`DNS resolution returned no addresses for ${hostname}`, hostname);
    }

    const resolvedIps = addresses.map((a) => a.address);
    if (!options.allowPrivate) {
      for (const ip of resolvedIps) {
        if (isPrivateOrBlockedIp(ip)) {
          throw new SsrfBlockedError(
            `Destination ${hostname} resolves to blocked/cloud-metadata address: ${ip}`,
            hostname,
            ip,
          );
        }
      }
    }

    return { url: parsed, resolvedIps };
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err;
    throw new SsrfBlockedError(`DNS lookup failed for ${hostname}: ${(err as Error).message}`, hostname);
  }
}

export async function safeFetch(
  input: string | URL,
  init?: RequestInit & { allowPrivate?: boolean },
): Promise<Response> {
  const urlString = typeof input === "string" ? input : input.toString();
  await validateUrlForSsrf(urlString, { allowPrivate: init?.allowPrivate });
  return fetch(input, init);
}
