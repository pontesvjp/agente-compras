import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './tokens.css';
import './estilos.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('O index.html precisa do elemento #raiz.');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
