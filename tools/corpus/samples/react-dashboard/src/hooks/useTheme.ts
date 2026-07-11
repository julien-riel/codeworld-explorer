import { useState } from "react";

export type Theme = "light" | "dark";

export function useTheme(initial: Theme = "light") {
  const [theme, setTheme] = useState<Theme>(initial);
  const toggle = () => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  };
  return { theme, toggle };
}
