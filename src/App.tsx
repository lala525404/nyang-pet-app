import { Routes, Route, Navigate } from 'react-router-dom';
import SettingsPage from './pages/SettingsPage';
import PetPage from './pages/PetPage';
import YarPage from './pages/YarPage';
import BreakTimePage from './pages/BreakTimePage';
import QuickPage from './pages/QuickPage';
import NoticePage from './pages/NoticePage';
import AlarmCleanupRunner from './components/AlarmCleanupRunner';

export default function App() {
  return (
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/pet" element={<><PetPage /><AlarmCleanupRunner /></>} />
      <Route path="/yar" element={<YarPage />} />
      <Route path="/breaktime" element={<BreakTimePage />} />
      <Route path="/quick" element={<QuickPage />} />
      <Route path="/notice" element={<NoticePage />} />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  );
}
