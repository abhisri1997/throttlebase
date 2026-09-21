import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  fetchPlaceDetails,
  fetchPlacePredictions,
  isMapsQuotaError,
  type PlacePrediction,
} from '../api/maps';
import { useTheme } from '../theme/ThemeContext';

/**
 * Place search backed by the maps proxy.
 *
 * Replaces react-native-google-places-autocomplete, which called the legacy
 * Places endpoints directly from the app with a bundled API key. Those
 * endpoints are not available on this Cloud project, and the key could be read
 * out of any build.
 */

/** Long enough that a search is deliberate; shorter inputs match too much to rank well. */
const MIN_QUERY_LENGTH = 3;

/** One request per typing pause rather than one per keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

const MAX_VISIBLE_PREDICTIONS = 5;

const QUOTA_MESSAGE = 'Search is busy, try again shortly.';
const FAILURE_MESSAGE = 'Could not search right now.';

export interface SelectedPlace {
  lat: number;
  lng: number;
  name: string;
}

interface PlaceSearchInputProps {
  placeholder: string;
  /** One token per picker session; the details call on select ends it. */
  sessionToken: string;
  /** Called after a selection, so the parent can start a fresh billing session. */
  onSessionConsumed: () => void;
  onSelect: (place: SelectedPlace) => void;
}

export function PlaceSearchInput({
  placeholder,
  sessionToken,
  onSessionConsumed,
  onSelect,
}: PlaceSearchInputProps) {
  const { colors } = useTheme();

  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const runSearch = useCallback(
    async (input: string, sessionTokenForSearch: string) => {
      const requestId = ++requestIdRef.current;
      setIsSearching(true);

      try {
        const results = await fetchPlacePredictions(input, sessionTokenForSearch);
        // A slower earlier search must never overwrite a newer one.
        if (!isMountedRef.current || requestId !== requestIdRef.current) return;

        setPredictions(results.slice(0, MAX_VISIBLE_PREDICTIONS));
        setMessage(results.length === 0 ? 'No places found.' : null);
      } catch (error) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) return;

        setPredictions([]);
        setMessage(isMapsQuotaError(error) ? QUOTA_MESSAGE : FAILURE_MESSAGE);
      } finally {
        if (isMountedRef.current && requestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [],
  );

  const handleChangeText = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      if (text.trim().length < MIN_QUERY_LENGTH) {
        // Supersede any in-flight search so its results cannot land after the
        // box has been cleared.
        requestIdRef.current += 1;
        setPredictions([]);
        setMessage(null);
        setIsSearching(false);
        return;
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void runSearch(text.trim(), sessionToken);
      }, SEARCH_DEBOUNCE_MS);
    },
    [runSearch, sessionToken],
  );

  const handleSelect = useCallback(
    async (prediction: PlacePrediction) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      // Nothing in flight may overwrite the choice the rider just made.
      requestIdRef.current += 1;

      const label = [prediction.primaryText, prediction.secondaryText]
        .filter(Boolean)
        .join(', ');

      setQuery(label);
      setPredictions([]);
      setMessage(null);
      setIsSearching(true);

      try {
        const details = await fetchPlaceDetails(prediction.placeId, sessionToken);
        if (!isMountedRef.current) return;

        onSelect({
          lat: details.lat,
          lng: details.lng,
          // The tapped label is what the rider expects to see saved; the
          // details response only supplies it when the prediction had none.
          name: label || details.name || details.address,
        });
      } catch (error) {
        if (!isMountedRef.current) return;
        setMessage(isMapsQuotaError(error) ? QUOTA_MESSAGE : FAILURE_MESSAGE);
      } finally {
        if (isMountedRef.current) setIsSearching(false);
        // The details call closes the billing session either way.
        onSessionConsumed();
      }
    },
    [onSelect, onSessionConsumed, sessionToken],
  );

  const hasResults = predictions.length > 0;

  return (
    <View style={{ zIndex: 1000, elevation: 10 }}>
      <View
        style={{
          backgroundColor: colors.inputBg,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <TextInput
          value={query}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          underlineColorAndroid='transparent'
          autoCapitalize='none'
          autoCorrect={false}
          accessibilityLabel={placeholder}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            color: colors.text,
            fontSize: 16,
            height: 48,
            // Web focus rings clash with the themed border above.
            outlineStyle: 'none',
          } as any}
        />
        {isSearching && <ActivityIndicator size='small' color={colors.primary} />}
      </View>

      {message && !hasResults && (
        <Text className='text-xs mt-2' style={{ color: colors.textMuted }}>
          {message}
        </Text>
      )}

      {hasResults && (
        <View
          style={{
            position: 'absolute',
            top: 56,
            left: 0,
            right: 0,
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            zIndex: 1000,
            elevation: 10,
            overflow: 'hidden',
          }}
        >
          {predictions.map((prediction, index) => (
            <TouchableOpacity
              key={prediction.placeId}
              onPress={() => void handleSelect(prediction)}
              accessibilityRole='button'
              accessibilityLabel={`${prediction.primaryText} ${prediction.secondaryText}`.trim()}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 12,
                borderTopWidth: index === 0 ? 0 : 0.5,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>
                {prediction.primaryText}
              </Text>
              {Boolean(prediction.secondaryText) && (
                <Text
                  style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {prediction.secondaryText}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
