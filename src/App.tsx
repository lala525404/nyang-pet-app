import { Routes, Route, Navigate } from 'react-router-dom';
import SettingsPage from './pages/SettingsPage';
import PetPage from './pages/PetPage';

export default function App() {
  return (
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/pet" element={<PetPage />} />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  );
}
