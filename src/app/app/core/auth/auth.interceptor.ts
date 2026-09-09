import { HttpInterceptorFn } from '@angular/common/http';

const sessionStorageKey = 'courier_session';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const sessionRaw = localStorage.getItem(sessionStorageKey);
  if (!sessionRaw) return next(request);

  try {
    const session = JSON.parse(sessionRaw) as { accessToken?: unknown };
    const accessToken = typeof session.accessToken === 'string' ? session.accessToken.trim() : '';
    if (accessToken) return next(request.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } }));
  } catch {
    localStorage.removeItem(sessionStorageKey);
  }

  return next(request);
};
