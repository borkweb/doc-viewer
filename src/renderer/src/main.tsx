import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './assets/fonts.css'
import './assets/fontawesome/css/all.min.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
