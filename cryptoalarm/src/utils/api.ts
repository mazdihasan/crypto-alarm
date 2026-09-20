import axios from 'axios';

// IMPORTANT: For Android Emulator, use 10.0.2.2. For Physical Device, use your machine's local IP (e.g., 192.168.1.x)
const BASE_URL = 'http://localhost:3000/api'; 

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

export default api;
