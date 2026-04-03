import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

export function usePullToRefresh(refetch: () => Promise<any>) {
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const player = useAudioPlayer(require('../../assets/button-press.wav'));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Provide a light initial haptic response when pull is released
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await queryClient.refetchQueries({ queryKey: ['notifications'], type: 'active' });
      
      // On success, play the loaded tick sound and trigger success haptic
      player.play();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    } catch (error) {
      // If fetching fails, let the user know via error haptic vibration
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, player, queryClient]);

  return { refreshing, onRefresh };
}
