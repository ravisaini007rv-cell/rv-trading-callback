/** Extract readable text from PDF / DOCX / plain files, all in the browser. */

export async function extractPdf(file: File, maxPages = 40): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Worker is served from the same origin via /public to avoid CDN dependence.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages = Math.min(doc.numPages, maxPages);
  const out: string[] = [];

  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push(`--- page ${i} ---\n${text}`);
  }

  if (doc.numPages > pages) {
    out.push(`\n(…${doc.numPages - pages} more pages not read)`);
  }
  return out.join("\n\n");
}

export async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractAny(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return extractPdf(file);
  if (name.endsWith(".docx")) return extractDocx(file);
  return (await file.text()).slice(0, 60000);
}

export const DOC_EXTENSIONS =
  ".pdf,.docx,.txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py,.java,.kt,.css,.html,.xml,.yml,.yaml,.sql,.sh";

export function isDocFile(file: File) {
  return !file.type.startsWith("image/");
}
