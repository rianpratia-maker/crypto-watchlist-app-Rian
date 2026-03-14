import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const showFatalError = (title, detail) => {
  const existing = document.getElementById('app-fatal')
  if (existing) return
  const wrap = document.createElement('div')
  wrap.id = 'app-fatal'
  wrap.style.position = 'fixed'
  wrap.style.inset = '16px'
  wrap.style.padding = '16px'
  wrap.style.borderRadius = '12px'
  wrap.style.background = '#1b2332'
  wrap.style.color = '#f2f6fb'
  wrap.style.fontFamily = 'system-ui, sans-serif'
  wrap.style.zIndex = '9999'
  wrap.style.overflow = 'auto'
  wrap.innerHTML = `
    <div style="font-weight:700;font-size:16px;margin-bottom:8px;">${title}</div>
    <div style="font-size:12px;opacity:.85;">${detail || 'Unknown error'}</div>
  `
  document.body.appendChild(wrap)
}

window.addEventListener('error', (e) => {
  showFatalError('App Error', e.message || 'Script error')
})
window.addEventListener('unhandledrejection', (e) => {
  showFatalError('App Error', String(e.reason || 'Unhandled rejection'))
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
