import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  token: string | null;
  rider: any | null; // Replace with proper type later
  isAuthenticated: boolean;
  login: (token: string, rider: any) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  rider: null,
  isAuthenticated: false,

  login: async (token: string, rider: any) => {
    await AsyncStorage.setItem('jwt_token', token);
    await AsyncStorage.setItem('rider_data', JSON.stringify(rider));
    set({ token, rider, isAuthenticated: true });
  },

  logout: async () => {
    await AsyncStorage.removeItem('jwt_token');
    await AsyncStorage.removeItem('rider_data');
    set({ token: null, rider: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      const token = await AsyncStorage.getItem('jwt_token');
      const riderStr = await AsyncStorage.getItem('rider_data');
      if (token && riderStr) {
        set({ token, rider: JSON.parse(riderStr), isAuthenticated: true });
      } else {
        set({ token: null, rider: null, isAuthenticated: false });
      }
    } catch (e) {
      set({ token: null, rider: null, isAuthenticated: false });
    }
  },
}));
