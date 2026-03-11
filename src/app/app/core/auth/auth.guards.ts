import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateChildFn,
  CanActivateFn,
  Router,
  RouterStateSnapshot
} from '@angular/router';
import { AuthService } from './auth.service';

function buildLoginRedirectUrl(
  router: Router,
  state: RouterStateSnapshot,
  authService: AuthService
): boolean | ReturnType<Router['createUrlTree']> {
  if (authService.hasValidSession()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: {
      returnUrl: state.url
    }
  });
}

export const authGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  return buildLoginRedirectUrl(router, state, authService);
};

export const authChildGuard: CanActivateChildFn = (
  _childRoute: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  return buildLoginRedirectUrl(router, state, authService);
};

export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  if (!authService.hasValidSession()) {
    return true;
  }

  return router.createUrlTree(['/app/dashboard']);
};
