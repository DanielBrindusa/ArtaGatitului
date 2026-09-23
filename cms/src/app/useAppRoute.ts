import { useSyncExternalStore } from 'react';

export type AppRoute = 'view' | 'edit' | 'settings';

const ROUTES = new Set<AppRoute>(['view', 'edit', 'settings']);

function routeSnapshot(): AppRoute {
  const route = window.location.hash.replace(/^#\/?/, '') as AppRoute;
  return ROUTES.has(route) ? route : 'view';
}

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useAppRoute() {
  const route = useSyncExternalStore<AppRoute>(subscribe, routeSnapshot, () => 'view');

  function navigate(nextRoute: AppRoute) {
    if (nextRoute === route) return;
    window.location.hash = nextRoute;
  }

  return { route, navigate };
}
