import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

/** True while the app is in the foreground. */
export const useAppIsActive = (): boolean => {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  return appState === "active";
};
