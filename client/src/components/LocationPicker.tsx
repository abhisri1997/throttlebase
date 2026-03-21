import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import MapView, { Marker, PROVIDER_GOOGLE } from './MapWrapper';
import * as Location from 'expo-location';
import { X, MapPin, Navigation, Check } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

interface LocationResult {
  coords: [number, number]; // [lng, lat]
  name: string;
}

interface LocationPickerProps {
  onSelect: (result: LocationResult) => void;
  initialCoords?: [number, number];
  initialName?: string;
  placeholder?: string;
  label: string;
  color?: string;
}

export default function LocationPicker({
  onSelect,
  initialCoords,
  initialName,
  placeholder = 'Search for a place...',
  label,
  color,
}: LocationPickerProps) {
  const { colors } = useTheme();
  const accentColor = color || colors.primary;
  const [visible, setVisible] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(
    initialCoords || null
  );
  const [selectedName, setSelectedName] = useState(initialName || '');
  const [loadingLocation, setLoadingLocation] = useState(false);
  const mapRef = useRef<any>(null);

  const handlePlaceSelect = (data: any, details: any) => {
    if (details?.geometry?.location) {
      const { lat, lng } = details.geometry.location;
      setSelectedCoords([lng, lat]);
      setSelectedName(data.description || details.name || 'Selected Location');
      mapRef.current?.animateToRegion({
        latitude: lat, longitude: lng,
        latitudeDelta: 0.01, longitudeDelta: 0.01,
      }, 500);
    }
  };

  const handleUseMyLocation = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingLocation(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      setSelectedCoords([longitude, latitude]);

      // Reverse geocode to get a name
      const [geocode] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geocode) {
        const parts = [geocode.name, geocode.city, geocode.region].filter(Boolean);
        setSelectedName(parts.join(', ') || 'My Location');
      } else {
        setSelectedName('My Location');
      }

      mapRef.current?.animateToRegion({
        latitude, longitude,
        latitudeDelta: 0.01, longitudeDelta: 0.01,
      }, 500);
    } catch (err) {
      console.error('Location error:', err);
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleMarkerDrag = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setSelectedCoords([longitude, latitude]);
    setSelectedName('Custom pin location');
  };

  const handleConfirm = () => {
    if (selectedCoords) {
      onSelect({ coords: selectedCoords, name: selectedName });
    }
    setVisible(false);
  };

  const displayText = initialName || (initialCoords ? 'Location set' : '');

  return (
    <>
      {/* Trigger Button */}
      <TouchableOpacity
        onPress={() => setVisible(true)}
        className="flex-row items-center p-4 rounded-xl mb-3"
        style={{
          backgroundColor: displayText ? accentColor + '15' : colors.inputBg,
          borderWidth: 1,
          borderColor: displayText ? accentColor + '50' : colors.border,
        }}
      >
        <MapPin color={displayText ? accentColor : colors.textMuted} size={20} />
        <View className="flex-1 ml-3">
          <Text className="text-xs" style={{ color: colors.textMuted }}>{label}</Text>
          <Text
            className="font-bold text-sm mt-0.5"
            style={{ color: displayText ? colors.text : colors.textMuted }}
            numberOfLines={1}
          >
            {displayText || placeholder}
          </Text>
        </View>
        {displayText && <Check color={accentColor} size={18} />}
      </TouchableOpacity>

      {/* Full-Screen Modal */}
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
          {/* Header */}
          <View
            className="flex-row items-center justify-between px-4 py-3"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <TouchableOpacity onPress={() => setVisible(false)}>
              <X color={colors.textMuted} size={24} />
            </TouchableOpacity>
            <Text className="font-bold text-lg" style={{ color: colors.text }}>{label}</Text>
            <TouchableOpacity onPress={handleConfirm} disabled={!selectedCoords}>
              <Text
                className="font-bold text-base"
                style={{ color: selectedCoords ? accentColor : colors.textMuted }}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View className="px-4 pt-3 z-10" style={{ zIndex: 10 }}>
            <GooglePlacesAutocomplete
              placeholder={placeholder}
              fetchDetails
              onPress={handlePlaceSelect}
              query={{
                key: API_KEY,
                language: 'en',
                components: 'country:in',
              }}
              debounce={300}
              enablePoweredByContainer={false}
              styles={{
                container: { flex: 0 },
                textInputContainer: {
                  backgroundColor: colors.inputBg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 4,
                },
                textInput: {
                  backgroundColor: 'transparent',
                  color: colors.text,
                  fontSize: 16,
                  height: 48,
                },
                listView: {
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  marginTop: 4,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
                row: {
                  backgroundColor: 'transparent',
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                },
                description: {
                  color: colors.text,
                  fontSize: 14,
                },
                separator: {
                  backgroundColor: colors.border,
                  height: 0.5,
                },
                poweredContainer: { display: 'none' },
              }}
              textInputProps={{
                placeholderTextColor: colors.textMuted,
              }}
            />

            {/* Use My Location button */}
            <TouchableOpacity
              onPress={handleUseMyLocation}
              disabled={loadingLocation}
              className="flex-row items-center p-3 rounded-xl mt-3"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              {loadingLocation ? (
                <ActivityIndicator color={accentColor} size="small" />
              ) : (
                <Navigation color={accentColor} size={18} />
              )}
              <Text className="font-bold ml-2" style={{ color: accentColor }}>
                Use My Current Location
              </Text>
            </TouchableOpacity>
          </View>

          {/* Map Preview */}
          <View className="flex-1 mt-4 mx-4 mb-4 rounded-2xl overflow-hidden"
            style={{ borderWidth: 1, borderColor: colors.border }}
          >
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              provider={PROVIDER_GOOGLE}
              userInterfaceStyle="dark"
              initialRegion={{
                latitude: selectedCoords ? selectedCoords[1] : 12.9716,
                longitude: selectedCoords ? selectedCoords[0] : 77.5946,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              {selectedCoords && (
                <Marker
                  coordinate={{
                    latitude: selectedCoords[1],
                    longitude: selectedCoords[0],
                  }}
                  draggable
                  onDragEnd={handleMarkerDrag}
                  pinColor={accentColor}
                  title={selectedName}
                />
              )}
            </MapView>
          </View>

          {/* Selected Location Bar */}
          {selectedCoords && selectedName && (
            <View className="mx-4 mb-4 p-4 rounded-xl"
              style={{ backgroundColor: accentColor + '15', borderWidth: 1, borderColor: accentColor + '40' }}
            >
              <Text className="text-xs" style={{ color: colors.textMuted }}>Selected Location</Text>
              <Text className="font-bold mt-1" style={{ color: colors.text }} numberOfLines={2}>
                {selectedName}
              </Text>
              <Text className="text-xs mt-1" style={{ color: colors.textMuted }}>
                Drag the pin on the map to fine-tune
              </Text>
            </View>
          )}

          {/* Confirm Button */}
          <View className="px-4 pb-4">
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!selectedCoords}
              className="p-4 rounded-2xl items-center"
              style={{ backgroundColor: selectedCoords ? accentColor : colors.border }}
            >
              <Text className="font-bold text-base" style={{ color: '#ffffff' }}>
                {selectedCoords ? 'Use This Location' : 'Search or tap the map'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
