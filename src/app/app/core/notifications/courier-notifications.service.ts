import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, switchMap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface VapidKeyResponse {
  publicKey: string;
}

interface PushSubscriptionPayload {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface AvailabilityResponse {
  isAvailable: boolean;
}

export type PushPermissionState = 'unsupported' | 'default' | 'denied' | 'granted';

@Injectable({ providedIn: 'root' })
export class CourierNotificationsService {
  private readonly http = inject(HttpClient);
  private readonly notificationsApiUrl = environment.notificationsApiUrl;
  private readonly catalogsApiUrl = environment.catalogsApiUrl;

  getPermissionState(): PushPermissionState {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return 'unsupported';
    }

    return Notification.permission;
  }

  enableAvailability(): Observable<AvailabilityResponse> {
    return this.getOrCreateSubscription().pipe(
      switchMap((subscription) => this.saveSubscription(subscription)),
      switchMap(() => this.updateCourierAvailability(true)),
      switchMap((availability) =>
        this.updatePushAvailability(true).pipe(
          map(() => availability),
          catchError((error: Error) =>
            this.updateCourierAvailability(false).pipe(
              switchMap(() => throwError(() => error))
            )
          )
        )
      ),
      catchError((error: Error) =>
        throwError(() => new Error(error.message || 'No fue posible activar las notificaciones.'))
      )
    );
  }

  disableAvailability(): Observable<AvailabilityResponse> {
    return this.updatePushAvailability(false).pipe(
      switchMap(() => this.updateCourierAvailability(false))
    );
  }

  getAvailability(): Observable<AvailabilityResponse> {
    return this.http.get<AvailabilityResponse>(`${this.catalogsApiUrl}/couriers/me/availability`);
  }

  private getOrCreateSubscription(): Observable<PushSubscriptionPayload> {
    const permission = this.getPermissionState();
    if (permission === 'unsupported') {
      return throwError(() => new Error('Este navegador no admite notificaciones push.'));
    }

    if (permission === 'denied') {
      return throwError(() => new Error('Las notificaciones están bloqueadas. Actívalas desde los ajustes del navegador.'));
    }

    return this.http.get<VapidKeyResponse>(`${this.notificationsApiUrl}/push/public-key`).pipe(
      switchMap(({ publicKey }) =>
        from(navigator.serviceWorker.ready).pipe(
          switchMap((registration) =>
            from(
              registration.pushManager.getSubscription().then(async (existingSubscription) => {
                if (existingSubscription) {
                  return existingSubscription;
                }

                const grantedPermission = await Notification.requestPermission();
                if (grantedPermission !== 'granted') {
                  throw new Error('Necesitas permitir las notificaciones para ponerte disponible.');
                }

                return registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: this.base64UrlToUint8Array(publicKey)
                });
              })
            )
          ),
          map((subscription) => subscription.toJSON() as PushSubscriptionPayload)
        )
      )
    );
  }

  private saveSubscription(subscription: PushSubscriptionPayload): Observable<void> {
    return this.http.post<void>(`${this.notificationsApiUrl}/push/subscriptions`, subscription);
  }

  private updatePushAvailability(isAvailable: boolean): Observable<void> {
    return this.http.patch<void>(`${this.notificationsApiUrl}/push/availability`, { isAvailable });
  }

  private updateCourierAvailability(isAvailable: boolean): Observable<AvailabilityResponse> {
    return this.http.patch<AvailabilityResponse>(`${this.catalogsApiUrl}/couriers/me/availability`, {
      isAvailable
    });
  }

  private base64UrlToUint8Array(value: string): Uint8Array {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const raw = atob(padded);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }
}
