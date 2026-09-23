import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderDesignTokenCss } from '../../src/shared/index.mjs';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import './App.css';

const tokenStyle = document.createElement('style');
tokenStyle.dataset.sharedDesignTokens = 'true';
tokenStyle.textContent = renderDesignTokenCss();
document.head.append(tokenStyle);

const root = document.getElementById('root');
if (!root) throw new Error('Application root element was not found.');

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
