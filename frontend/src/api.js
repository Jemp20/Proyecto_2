import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

// Adjunta el token a cada petición si hay sesión iniciada
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const mensajeDeError = (err) =>
  err.response?.data?.mensaje || 'No se pudo conectar con el servidor';

export default api;
