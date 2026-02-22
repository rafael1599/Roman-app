import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SwipeableToaster } from './components/ui/SwipeableToaster';
import './index.css';
import App from './App';
import { QueryProvider } from './components/QueryProvider';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
  <StrictMode>
    <QueryProvider>
      <App />
      <SwipeableToaster />
    </QueryProvider>
  </StrictMode>
);
