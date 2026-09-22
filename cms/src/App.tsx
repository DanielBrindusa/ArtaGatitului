import { useAppRoute } from './app/useAppRoute';
import { AppTopBar } from './components/AppTopBar';
import { EditMode } from './views/EditMode';
import { SettingsMode } from './views/SettingsMode';
import { ViewMode } from './views/ViewMode';

export default function App() {
  const { route, navigate } = useAppRoute();

  return (
    <div className="app-shell">
      <AppTopBar route={route} onNavigate={navigate} />
      {route === 'view' && <ViewMode />}
      {route === 'edit' && <EditMode />}
      {route === 'settings' && <SettingsMode />}
    </div>
  );
}
