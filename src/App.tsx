import { Routes, Route, Navigate } from 'react-router-dom';
import SettingsPage from './pages/SettingsPage';
import PetPage from './pages/PetPage';
import YarPage from './pages/YarPage';

export default function App() {
  return (
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/pet" element={<PetPage />} />
      <Route path="/yar" element={<YarPage />} />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  );
}
