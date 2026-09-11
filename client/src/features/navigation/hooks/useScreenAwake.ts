import { useEffect } from "react";
import { Platform } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

const warnInDev = (message: string, error: unknown): void => {
  if (__DEV__) {
    console.warn(message, error);
  }
};

/**
 * Keeps the screen on while enabled: mid-ride the rider never touches the
 * phone, and a sleeping screen means no guidance.
 */
export const useScreenAwake = (isEnabled: boolean, tag: string): void => {
  useEffect(() => {
    if (!isEnabled || Platform.OS === "web") return;

    const activation = activateKeepAwakeAsync(tag).catch((error: unknown) =>
      warnInDev("[navigation] could not keep the screen awake", error),
    );

    // Release only after activation settles, or a late activation would keep the screen on for good.
    return () => {
      activation
        .then(() => deactivateKeepAwake(tag))
        .catch((error: unknown) => warnInDev("[navigation] could not release the screen", error));
    };
  }, [isEnabled, tag]);
};
