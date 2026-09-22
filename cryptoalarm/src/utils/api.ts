import axios from 'axios';
import { Platform } from 'react-native';

// ─── Environment Switcher ─────────────────────────────────────────────────────
// Change to `true` to use Local Emulator, or `false` to use Live Server
const IS_LOCAL = false;

// Android Emulator accesses your PC localhost via 10.0.2.2, iOS uses localhost
const LOCAL_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000/api'
  : 'http://localhost:3000/api';

const PROD_URL = 'https://cryptoalarm-server.mazdi.dev/api';

export const BASE_URL = IS_LOCAL ? LOCAL_URL : PROD_URL;

const api = axios.create({
  baseURL: BASE_URL,
});

export const getAlarms = async (userId: string) => {
  const response = await api.get(`/alarms/${userId}`);
  return response.data;
};

export const createAlarm = async (data: { userId: string, deviceToken: string, symbol: string, condition: string, price: number }) => {
  const response = await api.post('/alarms', data);
  return response.data;
};

export const deleteAlarm = async (id: number) => {
  const response = await api.delete(`/alarms/${id}`);
  return response.data;
};

export const getSymbols = async () => {
  const response = await api.get('/symbols');
  return response.data;
};

export const getNotice = async (): Promise<{ text: string | null }> => {
  const response = await api.get('/notice');
  return response.data;
};

export const registerDevice = async (userId: string, deviceToken: string) => {
  const response = await api.post('/register', { userId, deviceToken });
  return response.data;
};

export default api;
