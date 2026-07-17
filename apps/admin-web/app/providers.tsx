"use client";

import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <FluentProvider theme={webLightTheme}>{children}</FluentProvider>;
}
