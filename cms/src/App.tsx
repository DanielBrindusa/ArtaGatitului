import { useAppRoute } from './app/useAppRoute';
import { resolveAppSurface } from './auth/authState.mjs';
import { useAuth } from './auth/AuthProvider';
import { AppTopBar } from './components/AppTopBar';
import { AuthGate } from './components/AuthGate';
import { VIEW_MODE_PLATFORM } from './platform/viewMode';
import { EditMode } from './views/EditMode';
import { SettingsMode } from './views/SettingsMode';
import { ViewMode } from './views/ViewMode';

export default function App() {
  const { route, navigate } = useAppRoute();
  const auth = useAuth();
  const surface = resolveAppSurface(route, auth.state);
  const isAndroidPlatform = VIEW_MODE_PLATFORM === 'android';
  const isAndroidView = route === 'view' && VIEW_MODE_PLATFORM === 'android';
  const isVisualEditor = surface === 'edit' && auth.state.status === 'authenticated-editor';

  async function handleSignOut() {
    if (await auth.signOut()) navigate('view');
  }

  return (
    <div className={`app-shell${isAndroidPlatform ? ' app-shell-android' : ''}${isAndroidView ? ' app-shell-mobile-view' : ''}${isVisualEditor ? ' app-shell-visual-editor' : ''}`}>
      {!isAndroidView && !isVisualEditor && (
        <AppTopBar
          route={route}
          authState={auth.state}
          onNavigate={navigate}
          onSignOut={() => void handleSignOut()}
        />
      )}
      {surface === 'view' && <ViewMode />}
      {surface === 'auth' && <AuthGate onReturnToView={() => navigate('view')} />}
      {surface === 'edit' && auth.state.status === 'authenticated-editor' && (
        <EditMode
          uid={auth.state.user.uid}
          email={auth.state.user.email}
          onNavigate={navigate}
          onSignOut={() => void handleSignOut()}
        />
      )}
      {surface === 'settings' && (
        <SettingsMode
          userEmail={auth.state.status === 'authenticated-editor' ? auth.state.user.email : null}
          onSignOut={() => void handleSignOut()}
        />
      )}
    </div>
  );
}
