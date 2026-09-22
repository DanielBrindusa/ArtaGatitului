import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  ArrowLeft,
  ArrowRight,
  House,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import brandIcon from '../../../icon.png';

export const PUBLIC_SITE_URL = 'https://danielbrindusa.github.io/ArtaGatitului/';
const NATIVE_VIEW_MODE = isTauri();
const CONNECTIVITY_TIMEOUT_MS = 8_000;

type ConnectionState = 'checking' | 'ready' | 'offline';
type ViewAction = 'back' | 'forward' | 'home' | 'reload';

function isTrustedPublicUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'danielbrindusa.github.io' &&
      (url.pathname === '/ArtaGatitului' || url.pathname.startsWith('/ArtaGatitului/'))
    );
  } catch {
    return false;
  }
}

async function publicSiteIsReachable() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);

  try {
    const response = await fetch(PUBLIC_SITE_URL, {
      method: 'HEAD',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    return response.ok && isTrustedPublicUrl(response.url);
  } finally {
    window.clearTimeout(timeout);
  }
}

async function setNativeVisibility(visible: boolean) {
  if (!NATIVE_VIEW_MODE) return;
  await invoke('set_view_visibility', { visible });
}

async function syncNativeBounds(surface: HTMLElement) {
  if (!NATIVE_VIEW_MODE) return;
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

function navigateBrowserFallback(
  action: ViewAction,
  iframeRef: RefObject<HTMLIFrameElement | null>,
  setIframeVersion: (update: (version: number) => number) => void,
) {
  if (action === 'home' && iframeRef.current) iframeRef.current.src = PUBLIC_SITE_URL;
  if (action === 'reload') setIframeVersion((version) => version + 1);
}

export function ViewMode() {
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [iframeVersion, setIframeVersion] = useState(0);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeRef = useRef(true);

  const connect = useCallback(async (reloadAfterCheck: boolean) => {
    setConnection('checking');

    try {
      const reachable = await publicSiteIsReachable();
      if (!activeRef.current) return;
      if (!reachable) throw new Error('The public site did not return a trusted response.');

      if (NATIVE_VIEW_MODE) {
        if (surfaceRef.current) await syncNativeBounds(surfaceRef.current);
        if (!activeRef.current) return;
        if (reloadAfterCheck) await invoke('navigate_view', { action: 'reload' });
        if (!activeRef.current) return;
        await setNativeVisibility(true);
        if (!activeRef.current) {
          await setNativeVisibility(false);
          return;
        }
      } else if (reloadAfterCheck) {
        setIframeVersion((version) => version + 1);
      }

      if (activeRef.current) setConnection('ready');
    } catch {
      await setNativeVisibility(false).catch(() => undefined);
      if (activeRef.current) setConnection('offline');
    }
  }, []);

  const navigate = useCallback(
    (action: ViewAction) => {
      if (action === 'reload') {
        void connect(true);
        return;
      }

      if (NATIVE_VIEW_MODE) {
        void invoke('navigate_view', { action }).catch(() => {
          void setNativeVisibility(false).catch(() => undefined);
          if (activeRef.current) setConnection('offline');
        });
      } else {
        navigateBrowserFallback(action, iframeRef, setIframeVersion);
      }
    },
    [connect],
  );

  useEffect(() => {
    activeRef.current = true;
    void connect(false);

    const handleOffline = () => {
      setConnection('offline');
      void setNativeVisibility(false).catch(() => undefined);
    };
    const handleOnline = () => void connect(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      activeRef.current = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      void setNativeVisibility(false).catch(() => undefined);
    };
  }, [connect]);

  useEffect(() => {
    if (!NATIVE_VIEW_MODE || !surfaceRef.current) return undefined;

    let frame = 0;
    const updateBounds = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (surfaceRef.current) void syncNativeBounds(surfaceRef.current);
      });
    };
    const observer = new ResizeObserver(updateBounds);
    observer.observe(surfaceRef.current);
    window.addEventListener('resize', updateBounds);
    updateBounds();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
    };
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        navigate('back');
      } else if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        navigate('forward');
      } else if (event.ctrlKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        navigate('reload');
      } else if (event.ctrlKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [navigate]);

  return (
    <main className="workspace view-workspace">
      <div className="view-toolbar" aria-label="View Mode navigation">
        <div className="view-navigation">
          <button
            type="button"
            onClick={() => navigate('back')}
            title={NATIVE_VIEW_MODE ? 'Înapoi (Alt+Stânga)' : 'Disponibil în aplicația Windows'}
            aria-label="Înapoi"
            disabled={!NATIVE_VIEW_MODE}
          >
            <ArrowLeft aria-hidden="true" size={18} />
          </button>
          <button
            type="button"
            onClick={() => navigate('forward')}
            title={NATIVE_VIEW_MODE ? 'Înainte (Alt+Dreapta)' : 'Disponibil în aplicația Windows'}
            aria-label="Înainte"
            disabled={!NATIVE_VIEW_MODE}
          >
            <ArrowRight aria-hidden="true" size={18} />
          </button>
          <span className="toolbar-divider" aria-hidden="true" />
          <button type="button" onClick={() => navigate('home')} title="Acasă" aria-label="Acasă">
            <House aria-hidden="true" size={17} />
          </button>
          <button
            type="button"
            onClick={() => navigate('reload')}
            title="Reîmprospătează (Ctrl+R)"
            aria-label="Reîmprospătează"
          >
            <RefreshCw aria-hidden="true" size={17} />
          </button>
        </div>

        <div className={`view-connection view-connection-${connection}`} aria-live="polite">
          {connection === 'offline' ? <WifiOff aria-hidden="true" size={15} /> : <Wifi aria-hidden="true" size={15} />}
          <span>
            {connection === 'checking' && 'Se verifică conexiunea'}
            {connection === 'ready' && 'Site public conectat'}
            {connection === 'offline' && 'Site indisponibil'}
          </span>
        </div>
      </div>

      <section ref={surfaceRef} className="public-view-surface" aria-label="Site-ul public Arta Gătitului">
        {connection === 'checking' && (
          <div className="view-state view-loading" role="status">
            <img src={brandIcon} alt="" />
            <h1>Arta Gătitului</h1>
            <p>Se încarcă site-ul public...</p>
            <span className="loading-line" aria-hidden="true" />
          </div>
        )}

        {connection === 'offline' && (
          <div className="view-state view-offline" role="alert">
            <WifiOff aria-hidden="true" size={28} />
            <h1>Nu există conexiune la internet.</h1>
            <p>Site-ul public nu poate fi încărcat momentan.</p>
            <button type="button" onClick={() => void connect(false)}>
              <RefreshCw aria-hidden="true" size={16} />
              Încearcă din nou
            </button>
          </div>
        )}

        {!NATIVE_VIEW_MODE && connection === 'ready' && (
          <iframe
            key={iframeVersion}
            ref={iframeRef}
            src={PUBLIC_SITE_URL}
            title="Site-ul public Arta Gătitului"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-downloads allow-forms allow-modals allow-same-origin allow-scripts"
          />
        )}
      </section>
    </main>
  );
}
