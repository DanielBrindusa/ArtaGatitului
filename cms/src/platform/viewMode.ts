import { invoke, isTauri } from '@tauri-apps/api/core';

export const PUBLIC_SITE_URL = 'https://danielbrindusa.github.io/ArtaGatitului/';

export type ViewModePlatform = 'android' | 'browser' | 'desktop';
export type ViewAction = 'back' | 'forward' | 'home' | 'reload';

function detectViewModePlatform(): ViewModePlatform {
  if (!isTauri()) return 'browser';
  return /Android/i.test(window.navigator.userAgent) ? 'android' : 'desktop';
}

export const VIEW_MODE_PLATFORM = detectViewModePlatform();

export async function setDesktopViewVisibility(visible: boolean) {
  if (VIEW_MODE_PLATFORM !== 'desktop') return;
  await invoke('set_view_visibility', { visible });
}

export async function syncDesktopViewBounds(surface: HTMLElement) {
  if (VIEW_MODE_PLATFORM !== 'desktop') return;
  const bounds = surface.getBoundingClientRect();
  await invoke('set_view_bounds', {
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
  });
}

export async function navigateDesktopView(action: ViewAction) {
  if (VIEW_MODE_PLATFORM !== 'desktop') return;
  await invoke('navigate_view', { action });
}

export function enterAndroidPublicView() {
  if (VIEW_MODE_PLATFORM !== 'android') return;
  window.location.replace(PUBLIC_SITE_URL);
}
