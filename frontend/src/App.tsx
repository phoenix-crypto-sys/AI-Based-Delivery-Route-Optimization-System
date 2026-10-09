import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ConsumerNavigationView } from './views/ConsumerNavigationView';
import { LiveDispatcherDashboard } from './views/LiveDispatcherDashboard';
import { DriverCompanionView } from './views/DriverCompanionView';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/navigation" replace />} />
          <Route path="/navigation" element={<ConsumerNavigationView />} />
          <Route path="/live" element={<LiveDispatcherDashboard />} />
          <Route path="/driver" element={<DriverCompanionView />} />
          {/* Fallback & legacy demo redirect to Real World Consumer Navigation */}
          <Route path="/simulation" element={<Navigate to="/navigation" replace />} />
          <Route path="*" element={<Navigate to="/navigation" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
};

export default App;
