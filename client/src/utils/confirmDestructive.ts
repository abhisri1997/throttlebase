import { Alert, Platform } from "react-native";

/**
 * Asks before something that can't be undone. Resolves true only if the
 * person confirms. On the web Alert.alert has no buttons, so the browser's
 * own dialog asks instead.
 */
export const confirmDestructive = (input: {
  title: string;
  message: string;
  confirmLabel: string;
}): Promise<boolean> => {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(`${input.title}\n\n${input.message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(
      input.title,
      input.message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: input.confirmLabel, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
};
