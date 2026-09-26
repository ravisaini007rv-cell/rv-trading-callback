/**
 * Real browser control.
 *
 * A persistent Chromium profile lives in ~/.rv-agent-browser, so once you log
 * into WhatsApp Web / Gmail / anything by hand, the agent stays logged in for
 * every later run. The window is visible by default: you watch it work, and you
 * can take over at any moment.
 *
 * Playwright is loaded lazily — the rest of the agent runs without it.
 */

import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";

const PROFILE_DIR = path.join(os.homedir(), ".rv-agent-browser");
const SHOT_DIR = path.join(os.homedir(), ".rv-agent-shots");

let ctx = null; // persistent browser context
let page = null; // active page

export function isAvailable() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return !!import.meta.resolve("playwright");
  } catch {
    return false;
  }
}

async function ensureBrowser(headless = false) {
  if (ctx && page && !page.isClosed()) return page;

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "Playwright is not installed. Run:  npm i playwright && npx playwright install chromium",
    );
  }

  await fs.mkdir(PROFILE_DIR, { recursive: true });

  try {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless,
      viewport: { width: 1280, height: 860 },
      args: ["--disable-blink-features=AutomationControlled"],
    });
  } catch (e) {
    if (/Executable doesn't exist|browserType.launch/i.test(e.message)) {
      throw new Error(
        "Chromium is not downloaded yet. Run:  npx playwright install chromium",
      );
    }
    throw e;
  }

  page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(20_000);
  return page;
}

export async function closeBrowser() {
  try {
    await ctx?.close();
  } catch {
    /* already gone */
  }
  ctx = null;
  page = null;
}

/** Compact, readable view of the page so the model can decide what to do. */
async function describePage(p) {
  const info = await p.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        s.display !== "none" &&
        r.top < window.innerHeight + 600
      );
    };

    const label = (el) =>
      (
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title") ||
        el.getAttribute("name") ||
        el.value ||
        el.innerText ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);

    const clickables = [...document.querySelectorAll(
      'a,button,[role=button],input[type=submit],[onclick]',
    )]
      .filter(visible)
      .map(label)
      .filter(Boolean)
      .slice(0, 40);

    const inputs = [...document.querySelectorAll(
      'input,textarea,[contenteditable="true"],[role=textbox]',
    )]
      .filter(visible)
      .map((el) => {
        const t = el.getAttribute("type") || el.tagName.toLowerCase();
        return `${t}: ${label(el) || "(empty)"}`;
      })
      .slice(0, 25);

    const text = (document.body.innerText || "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 3500);

    return { clickables, inputs, text };
  });

  return [
    `URL: ${p.url()}`,
    `TITLE: ${await p.title()}`,
    info.inputs.length ? `\nINPUT FIELDS:\n${info.inputs.map((i) => "- " + i).join("\n")}` : "",
    info.clickables.length
      ? `\nCLICKABLE:\n${info.clickables.map((t) => "- " + t).join("\n")}`
      : "",
    `\nPAGE TEXT:\n${info.text}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Find an element by visible text, label, placeholder or CSS — in that order. */
async function locate(p, target) {
  const candidates = [
    () => p.getByRole("button", { name: target, exact: false }).first(),
    () => p.getByRole("link", { name: target, exact: false }).first(),
    () => p.getByPlaceholder(target, { exact: false }).first(),
    () => p.getByLabel(target, { exact: false }).first(),
    () => p.getByText(target, { exact: false }).first(),
    () => p.locator(target).first(), // raw CSS selector
  ];

  for (const make of candidates) {
    try {
      const el = make();
      if ((await el.count()) > 0) {
        await el.waitFor({ state: "visible", timeout: 4000 });
        return el;
      }
    } catch {
      /* try the next strategy */
    }
  }
  return null;
}

export const BROWSER_TOOLS = [
  {
    name: "browser_open",
    args: { url: "https://…" },
    desc: "Open a URL in a real Chromium window. Logins persist between runs. Returns what is on the page.",
  },
  {
    name: "browser_read",
    args: {},
    desc: "Re-read the current page: URL, input fields, clickable elements and text.",
  },
  {
    name: "browser_click",
    args: { target: "button text, link text, or a CSS selector" },
    desc: "Click something on the page, found by its visible text or a selector.",
  },
  {
    name: "browser_type",
    args: { target: "field label/placeholder or CSS", text: "what to type", enter: "true to press Enter" },
    desc: "Type into a field. Set enter to true to submit.",
  },
  {
    name: "browser_screenshot",
    args: {},
    desc: "Save a PNG of the current page and return its path.",
  },
];

export async function executeBrowserTool(tool, args) {
  switch (tool) {
    case "browser_open": {
      const p = await ensureBrowser();
      const url = /^https?:\/\//i.test(args.url) ? args.url : `https://${args.url}`;
      await p.goto(url, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(1200);
      return await describePage(p);
    }

    case "browser_read": {
      if (!page) return "Error: no page is open. Use browser_open first.";
      return await describePage(page);
    }

    case "browser_click": {
      if (!page) return "Error: no page is open. Use browser_open first.";
      const el = await locate(page, args.target ?? "");
      if (!el) return `Error: could not find "${args.target}". Use browser_read to see what is on the page.`;
      await el.click();
      await page.waitForTimeout(1500);
      return `Clicked "${args.target}".\n\n` + (await describePage(page));
    }

    case "browser_type": {
      if (!page) return "Error: no page is open. Use browser_open first.";
      const el = await locate(page, args.target ?? "");
      if (!el) return `Error: could not find the field "${args.target}". Use browser_read first.`;
      await el.click();
      await el.fill("").catch(() => {});
      await el.type(String(args.text ?? ""), { delay: 30 });
      if (String(args.enter) === "true") {
        await el.press("Enter");
        await page.waitForTimeout(2000);
      }
      return `Typed into "${args.target}".\n\n` + (await describePage(page));
    }

    case "browser_screenshot": {
      if (!page) return "Error: no page is open.";
      await fs.mkdir(SHOT_DIR, { recursive: true });
      const file = path.join(SHOT_DIR, `shot-${Date.now()}.png`);
      await page.screenshot({ path: file, fullPage: false });
      return `Screenshot saved: ${file}`;
    }

    default:
      return `Error: unknown browser tool "${tool}"`;
  }
}

export const BROWSER_TOOL_NAMES = BROWSER_TOOLS.map((t) => t.name);
