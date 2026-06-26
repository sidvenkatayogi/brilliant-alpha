import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { ProgressProvider } from './progress/ProgressContext'
import { CohortProvider } from './cohort/CohortContext'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ProgressProvider>
          <CohortProvider>
            <App />
          </CohortProvider>
        </ProgressProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
