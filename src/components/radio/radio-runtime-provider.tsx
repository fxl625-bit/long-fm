"use client";

import { createContext, useEffect, useRef } from "react";
import { RadioRuntime } from "@/lib/radio/radio-runtime";

export const RadioRuntimeContext = createContext<RadioRuntime | null>(null);

export function RadioRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtimeRef = useRef<RadioRuntime | null>(null);

  if (runtimeRef.current == null) {
    runtimeRef.current = new RadioRuntime();
  }

  // eslint-disable-next-line react-hooks/refs -- stable singleton access after deterministic lazy initialization above
  const runtime = runtimeRef.current;

  useEffect(() => {
    runtime.markProviderMountedAtRoot();
    runtime.init();
    return () => {
      runtime.dispose();
    };
  }, [runtime]);

  return <RadioRuntimeContext.Provider value={runtime}>{children}</RadioRuntimeContext.Provider>;
}
