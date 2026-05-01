export function normalizeCanonicalUrl(input: string): string {
  const parsed = new URL(input);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();

  if (parsed.hostname === "youtu.be") {
    const videoId = parsed.pathname.replace("/", "");
    parsed.hostname = "www.youtube.com";
    parsed.pathname = "/watch";
    parsed.search = videoId ? `?v=${videoId}` : "";
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (
      key.startsWith("utm_") ||
      ["fbclid", "gclid", "si", "feature", "ab_channel"].includes(key)
    ) {
      parsed.searchParams.delete(key);
    }
  }

  const ordered = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  parsed.search = "";
  for (const [key, value] of ordered) {
    parsed.searchParams.append(key, value);
  }

  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return parsed.toString();
}

export function getDomain(input: string): string {
  return new URL(input).hostname.replace(/^www\./, "");
}

export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
