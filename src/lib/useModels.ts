"use client";

import { useEffect, useState } from "react";
import { MODELS, type ModelDef } from "./models";
import { getLocalModels, setLocalModels } from "./fallback";
import { probeOllama } from "./ollama";

let probed = false;

/**
 * All selectable models: any locally installed Ollama models first (unlimited),
 * then the hosted free ones. Probes Ollama once per page load.
 */
export function useModels(): ModelDef[] {
  const [local, setLocal] = useState<ModelDef[]>(getLocalModels());

  useEffect(() => {
    if (probed) {
      setLocal(getLocalModels());
      return;
    }
    probed = true;
    let alive = true;
    probeOllama().then((res) => {
      setLocalModels(res.state === "online" ? res.models : []);
      if (alive) setLocal(getLocalModels());
    });
    return () => {
      alive = false;
    };
  }, []);

  return [...local, ...MODELS];
}
