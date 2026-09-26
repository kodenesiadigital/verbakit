import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.tsx';
import { AuthProvider } from './auth.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

// basename disamakan dengan base Vite (/admin/) supaya routing SPA cocok
// baik di dev (5173) maupun produksi (domain yang sama).
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter basename={BASENAME}>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);

