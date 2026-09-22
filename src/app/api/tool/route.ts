import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

/* ------------------------------------------------------------------ */
/* web_search — DuckDuckGo lite, no API key required                    */
/* ------------------------------------------------------------------ */
async function webSearch(query: string) {
  const res = await fetch("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: new URLSearchParams({ q: query }),
  });
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  const html = await res.text();

  const results: { title: string; url: string; snippet: string }[] = [];
  const linkRe =
    /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snipRe = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;

  const links = [...html.matchAll(linkRe)];
  const snips = [...html.matchAll(snipRe)];

  for (let i = 0; i < Math.min(links.length, 8); i++) {
    const rawUrl = decodeURIComponent(
      links[i][1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&rut=")[0],
    );
    results.push({
      title: strip(links[i][2]),
      url: rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`,
      snippet: strip(snips[i]?.[1] ?? ""),
    });
  }

  if (!results.length) throw new Error("no results");
  return results;
}

/* ------------------------------------------------------------------ */
/* fetch_url — readable text of a page                                  */
/* ------------------------------------------------------------------ */
async function fetchUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http(s)://");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  const raw = await res.text();

  if (type.includes("json")) return { url, content: raw.slice(0, 12000) };

  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  return { url, content: strip(text).slice(0, 12000) };
}

function strip(s: string) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const { tool, args } = (await req.json()) as {
      tool: string;
      args: Record<string, string>;
    };

    switch (tool) {
      case "web_search":
        return NextResponse.json({ ok: true, result: await webSearch(args.query ?? "") });
      case "fetch_url":
        return NextResponse.json({ ok: true, result: await fetchUrl(args.url ?? "") });
      default:
        return NextResponse.json({ ok: false, error: `unknown tool: ${tool}` });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}
