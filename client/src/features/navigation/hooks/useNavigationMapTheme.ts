import { useEffect, useState } from "react";
import { navigationMapThemeAt, type NavigationMapTheme } from "../core/mapStyles";

const THEME_CHECK_INTERVAL_MS = 60_000;

/**
 * Day or night map by local time, re-checked every minute. The themes are
 * shared constants, so a check that doesn't cross 06:00 or 18:30 re-renders nothing.
 */
export const useNavigationMapTheme = (): NavigationMapTheme => {
  const [theme, setTheme] = useState(() => navigationMapThemeAt(new Date()));

  useEffect(() => {
    const timer = setInterval(
      () => setTheme(navigationMapThemeAt(new Date())),
      THEME_CHECK_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return theme;
};
