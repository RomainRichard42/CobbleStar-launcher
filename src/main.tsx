import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Startup } from './Startup'
import './explorer.css'
import './fielddesk.css'
import './league.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Startup />
  </StrictMode>,
)
