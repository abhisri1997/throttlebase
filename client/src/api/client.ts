import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const debuggerHost = Constants.expoConfig?.hostUri;
const localIp = debuggerHost?.split(':')[0];

let BASE_URL = 'http://localhost:5001'; // Fallback for Web/Simulator
if (Platform.OS === 'android' && !debuggerHost) {
  BASE_URL = 'http://10.0.2.2:5001'; // Android emulator
} else if (localIp) {
  BASE_URL = `http://${localIp}:5001`; // Physical device on LAN
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

import { useAuthStore } from '../store/authStore';

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('jwt_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (
      error.response &&
      (error.response.status === 401 || error.response.status === 403) &&
      error.response.data?.error === 'Invalid or expired token.'
    ) {
      await useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
