const RELOAD_ONCE_KEY = "betese:hardRedirectReload";

function destUrl(path: string): string {
  return path.startsWith("http")
    ? path
    : `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function stripHash(url: string): string {
  const i = url.indexOf("#");
  return i === -1 ? url : url.slice(0, i);
}

function isAlreadyThere(target: string, path: string): boolean {
  const here = stripHash(window.location.href);
  const dest = stripHash(target);
  if (here === dest) return true;
  const pathAndQuery = path.startsWith("http")
    ? (() => {
        try {
          const u = new URL(path);
          return u.pathname + u.search;
        } catch {
          return path;
        }
      })()
    : path.startsWith("/")
      ? path
      : `/${path}`;
  return window.location.pathname + window.location.search === pathAndQuery;
}

/**
 * Full-page navigation — avoids Next.js client router getting stuck on auth redirects.
 * Chrome's leaked-password dialog can swallow the first replace(); we retry once.
 * Same-URL calls reload once so a staff session is not left on a spinner forever.
 */
export function hardRedirect(path: string): void {
  if (typeof window === "undefined") return;
  const target = destUrl(path);

  if (isAlreadyThere(target, path)) {
    try {
      if (sessionStorage.getItem(RELOAD_ONCE_KEY) === target) return;
      sessionStorage.setItem(RELOAD_ONCE_KEY, target);
    } catch {
      /* private mode */
    }
    window.location.reload();
    return;
  }

  try {
    sessionStorage.removeItem(RELOAD_ONCE_KEY);
  } catch {
    /* ignore */
  }

  window.location.replace(target);

  window.setTimeout(() => {
    if (isAlreadyThere(target, path)) return;
    window.location.assign(target);
  }, 1600);
}

export function clearHardRedirectGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_ONCE_KEY);
  } catch {
    /* ignore */
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}
