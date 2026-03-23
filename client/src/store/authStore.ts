import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const parseCoordsTuple = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  return [lng, lat];
};

const normalizeLocationCoords = (locationCoords: any): any => {
  if (locationCoords === undefined || locationCoords === null) {
    return locationCoords;
  }

  if (typeof locationCoords === "string") {
    try {
      return normalizeLocationCoords(JSON.parse(locationCoords));
    } catch {
      return locationCoords;
    }
  }

  const fromArray = parseCoordsTuple(locationCoords);
  if (fromArray) {
    return { type: "Point", coordinates: fromArray };
  }

  if (typeof locationCoords === "object") {
    const fromGeoJson = parseCoordsTuple(locationCoords.coordinates);
    if (fromGeoJson) {
      return {
        ...locationCoords,
        type: locationCoords.type || "Point",
        coordinates: fromGeoJson,
      };
    }

    const fromLngLat = parseCoordsTuple([
      locationCoords.lng,
      locationCoords.lat,
    ]);
    if (fromLngLat) {
      return { type: "Point", coordinates: fromLngLat };
    }
  }

  return locationCoords;
};

const normalizeRider = (rider: any): any => {
  if (!rider || typeof rider !== "object") {
    return rider;
  }

  return {
    ...rider,
    location_coords: normalizeLocationCoords(rider.location_coords),
  };
};

interface AuthState {
  token: string | null;
  rider: any | null; // Replace with proper type later
  isAuthenticated: boolean;
  authNotice: string | null;
  login: (token: string, rider: any) => Promise<void>;
  syncRider: (rider: any) => Promise<void>;
  showAuthNotice: (message: string) => void;
  clearAuthNotice: () => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  rider: null,
  isAuthenticated: false,
  authNotice: null,

  login: async (token: string, rider: any) => {
    const normalizedRider = normalizeRider(rider);
    await AsyncStorage.setItem("jwt_token", token);
    await AsyncStorage.setItem("rider_data", JSON.stringify(normalizedRider));
    set({
      token,
      rider: normalizedRider,
      isAuthenticated: true,
      authNotice: null,
    });
  },

  syncRider: async (rider: any) => {
    const normalizedRider = normalizeRider(rider);
    await AsyncStorage.setItem("rider_data", JSON.stringify(normalizedRider));
    set((state) => ({
      ...state,
      rider: normalizedRider,
    }));
  },

  showAuthNotice: (message: string) => {
    set((state) => {
      if (state.authNotice === message) {
        return state;
      }

      return {
        ...state,
        authNotice: message,
      };
    });
  },

  clearAuthNotice: () => {
    set((state) => ({
      ...state,
      authNotice: null,
    }));
  },

  logout: async () => {
    await AsyncStorage.removeItem("jwt_token");
    await AsyncStorage.removeItem("rider_data");
    set({ token: null, rider: null, isAuthenticated: false, authNotice: null });
  },

  checkAuth: async () => {
    try {
      const token = await AsyncStorage.getItem("jwt_token");
      const riderStr = await AsyncStorage.getItem("rider_data");
      if (token && riderStr) {
        set({
          token,
          rider: normalizeRider(JSON.parse(riderStr)),
          isAuthenticated: true,
          authNotice: null,
        });
      } else {
        set({
          token: null,
          rider: null,
          isAuthenticated: false,
          authNotice: null,
        });
      }
    } catch (e) {
      set({
        token: null,
        rider: null,
        isAuthenticated: false,
        authNotice: null,
      });
    }
  },
}));

export const syncRiderFromResponse = async (
  response: any,
  overrides?: Record<string, unknown>,
): Promise<any | null> => {
  const nextRider = response?.rider;
  if (!nextRider) {
    return null;
  }

  const normalizedRider = normalizeRider({
    ...nextRider,
    ...(overrides || {}),
  });
  await useAuthStore.getState().syncRider(normalizedRider);
  return normalizedRider;
};
