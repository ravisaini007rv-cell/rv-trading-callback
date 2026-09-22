"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Renders a mermaid diagram; falls back to the raw source if it can't parse. */
export default function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.classList.contains("light") ? "default" : "dark",
          securityLevel: "strict",
        });
        const { svg } = await mermaid.render(`m${id}`, chart);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-3 text-xs">
        {chart}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className="my-3 flex justify-center overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-3"
    />
  );
}
