import React from 'react';
import { createRoot } from 'react-dom/client';
import 'remixicon/fonts/remixicon.css';
import './styles/tokens.css';
import './styles/global.css';
import { BrandProvider } from './brand/BrandContext.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrandProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrandProvider>
  </React.StrictMode>,
);
