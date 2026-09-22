export type ProjectFile = { path: string; content: string };

export const STARTER: ProjectFile[] = [
  {
    path: "index.html",
    content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>My App</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>Hello 👋</h1>
    <p>Ask the agent to build something here.</p>
    <button id="go">Click me</button>
  </main>
  <script src="app.js"></script>
</body>
</html>`,
  },
  {
    path: "style.css",
    content: `* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, sans-serif;
  background: #0f1117;
  color: #e8eaf0;
}
main { text-align: center; padding: 2rem; }
button {
  margin-top: 1rem;
  padding: .7rem 1.4rem;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #6d8bff, #a76dff);
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
}`,
  },
  {
    path: "app.js",
    content: `document.getElementById("go").addEventListener("click", () => {
  alert("It works!");
});`,
  },
];

/**
 * Bundle a multi-file static project into one self-contained HTML document
 * that can run inside a sandboxed iframe via srcdoc.
 */
export function buildPreviewHtml(files: ProjectFile[]): string {
  const get = (p: string) => files.find((f) => f.path === p)?.content ?? "";
  let html = get("index.html") || "<h1>No index.html</h1>";

  // inline local stylesheets
  html = html.replace(
    /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi,
    (m, href: string) => {
      const css = get(href.replace(/^\.\//, ""));
      return css ? `<style>\n${css}\n</style>` : m;
    },
  );

  // inline local scripts
  html = html.replace(
    /<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/gi,
    (m, src: string) => {
      const js = get(src.replace(/^\.\//, ""));
      return js ? `<script type="module">\n${js}\n</script>` : m;
    },
  );

  // surface runtime errors to the parent window
  const hook = `<script>
    window.onerror = function (msg, src, line, col) {
      parent.postMessage({ __rvError: msg + " (line " + line + ")" }, "*");
    };
    window.addEventListener("unhandledrejection", function (e) {
      parent.postMessage({ __rvError: "Unhandled promise: " + e.reason }, "*");
    });
  </script>`;

  return html.replace(/<\/head>/i, `${hook}</head>`) === html
    ? hook + html
    : html.replace(/<\/head>/i, `${hook}</head>`);
}

export function guessLanguage(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return (
    {
      html: "html",
      css: "css",
      js: "javascript",
      jsx: "jsx",
      ts: "typescript",
      tsx: "tsx",
      json: "json",
      md: "markdown",
      py: "python",
      java: "java",
      kt: "kotlin",
      xml: "xml",
    }[ext ?? ""] ?? "text"
  );
}

/** Parse ```write path=... fenced blocks emitted by the agent. */
export function parseWriteBlocks(text: string): ProjectFile[] {
  const out: ProjectFile[] = [];
  const re = /```write\s+path=([^\s\n]+)\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ path: m[1].trim().replace(/^\.?\//, ""), content: m[2].replace(/\n$/, "") });
  }
  return out;
}

export async function downloadZip(files: ProjectFile[], name = "rv-project.zip") {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.path, f.content));
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
