import { useAppRoute } from './app/useAppRoute';
import { AppTopBar } from './components/AppTopBar';
import { VIEW_MODE_PLATFORM } from './platform/viewMode';
import { EditMode } from './views/EditMode';
import { SettingsMode } from './views/SettingsMode';
import { ViewMode } from './views/ViewMode';

export default function App() {
  const { route, navigate } = useAppRoute();
  const isAndroidView = route === 'view' && VIEW_MODE_PLATFORM === 'android';

  return (
    <div className={`app-shell${isAndroidView ? ' app-shell-mobile-view' : ''}`}>
      {!isAndroidView && <AppTopBar route={route} onNavigate={navigate} />}
      {route === 'view' && <ViewMode />}
      {route === 'edit' && <EditMode />}
      {route === 'settings' && <SettingsMode />}
    </div>
  );
}
