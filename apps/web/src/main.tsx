import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './Paper.css';
import { setNonce } from 'get-nonce';
const nonce=document.querySelector<HTMLMetaElement>('meta[name="style-nonce"]')?.content;
if(nonce)setNonce(nonce);
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
