import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { getApiErrorMessage } from "../../../utils/apiError";
import { useLiveSessionStore } from "../../../store/liveSessionStore";
import { currentAlertCoords, postGroupAlert } from "../api/groupAlert";

export interface GroupAlertControls {
  isSheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  send: () => Promise<void>;
  isSending: boolean;
}

/**
 * Sending a group alert from any ride screen: the sheet's state, and the send
 * itself — over the live socket when in the room, over HTTP otherwise.
 */
export const useGroupAlert = (rideId: string | undefined): GroupAlertControls => {
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [isSending, setSending] = useState(false);
  const sendOverSocket = useLiveSessionStore((state) => state.sendGroupAlert);

  const send = useCallback(async () => {
    if (!rideId || isSending) return;
    setSending(true);

    try {
      const coords = await currentAlertCoords();
      if (!sendOverSocket(coords)) {
        await postGroupAlert(rideId, coords);
      }
      setSheetOpen(false);
      Alert.alert(
        "Alert sent",
        "Everyone on this ride has been alerted with your location. If you need help now, call 112.",
      );
    } catch (error) {
      Alert.alert(
        "Alert not sent",
        `${getApiErrorMessage(error, "Couldn't reach the group.")} If you need help now, call 112.`,
      );
    } finally {
      setSending(false);
    }
  }, [isSending, rideId, sendOverSocket]);

  return {
    isSheetOpen,
    openSheet: useCallback(() => setSheetOpen(true), []),
    closeSheet: useCallback(() => setSheetOpen(false), []),
    send,
    isSending,
  };
};
