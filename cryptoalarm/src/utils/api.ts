import axios from 'axios';

const BASE_URL = 'https://cryptoalarm-server.mazdi.dev/api';

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
