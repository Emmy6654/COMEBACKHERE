import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SettlementApproval } from './components/SettlementApproval'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/settlements" element={<SettlementApproval />} />
        <Route path="*" element={<Navigate to="/settlements" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
