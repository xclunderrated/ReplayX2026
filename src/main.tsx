import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Handle harmless browser visibility/closing errors gracefully
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (
      event.reason?.message?.includes('Database is closing/hidden') ||
      event.reason?.name === 'DatabaseClosedError' ||
      event.reason?.message?.includes('database is closing')
    ) {
      event.preventDefault();
      // Silently prevent unhandled rejection noise when tab is closing/hidden
    }
  });
}

// Register the service worker in production only — dev mode uses Vite HMR
// which conflicts with the SW's navigation interception.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((error) => console.warn('SW registration failed:', error));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


