import type { Conversation } from "./types";

function download(content: string, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "chat";

export function exportMarkdown(c: Conversation) {
  const body = c.messages
    .map((m) => {
      const who = m.role === "user" ? "### 🧑 You" : `### 🤖 ${m.modelLabel ?? "RV AI"}`;
      const tools = m.toolRuns?.length
        ? `\n\n<sub>tools used: ${m.toolRuns.map((t) => t.tool).join(", ")}</sub>`
        : "";
      return `${who}\n\n${m.content}${tools}`;
    })
    .join("\n\n---\n\n");

  const md = `# ${c.title}\n\n_Exported ${new Date().toLocaleString()} from RV AI Studio_\n\n${body}\n`;
  download(md, `${slug(c.title)}.md`, "text/markdown");
}

export function exportJson(c: Conversation) {
  download(JSON.stringify(c, null, 2), `${slug(c.title)}.json`, "application/json");
}

/** Opens a print dialog styled for PDF — the browser's "Save as PDF" does the rest. */
export function exportPdf(c: Conversation) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const body = c.messages
    .map(
      (m) => `<section class="${m.role}">
        <h3>${m.role === "user" ? "You" : esc(m.modelLabel ?? "RV AI")}</h3>
        <pre>${esc(m.content)}</pre>
      </section>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)}</title>
  <style>
    body{font:14px/1.6 system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#111}
    h1{font-size:22px} h3{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#666;margin:0 0 .4rem}
    section{margin:0 0 1.4rem;padding:.9rem 1rem;border-radius:10px;break-inside:avoid}
    .user{background:#f1f3f9} .assistant{background:#fff;border:1px solid #e3e6ef}
    pre{white-space:pre-wrap;word-break:break-word;font:inherit;margin:0}
    @media print{ body{margin:0} }
  </style></head>
  <body><h1>${esc(c.title)}</h1><p style="color:#666">Exported ${new Date().toLocaleString()}</p>
  ${body}
  <script>window.onload=()=>{window.print()}</script></body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow pop-ups to export as PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
}
