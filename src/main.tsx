import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { registerServiceWorker } from './pwa/serviceWorker'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener(
    'load',
    () => void registerServiceWorker(navigator.serviceWorker),
    { once: true },
  )
}
