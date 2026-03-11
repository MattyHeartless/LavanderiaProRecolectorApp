import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

export interface LoginCourierRequest {
  email: string;
  password: string;
}

export interface LoginCourierResponse {
  email: string;
  fullName: string;
  id: string;
  phoneNumber: string;
}

export interface CourierProfile {
  id: string;
  name: string;
  middleName: string;
  lastName: string;
  vehicle: string;
  address: string;
  neighborhood: string;
  zipCode: string;
  city: string;
  phoneNumber: string;
  authUserId: string;
  isActive: boolean;
  profileImageUrl?: string | null;
}

export interface CourierByAuthUserResponse {
  courier: CourierProfile;
}

export interface CourierSession {
  authUser: LoginCourierResponse;
  courier: CourierProfile;
}

export interface UploadCourierProfileImageResponse {
  message?: string;
  imageUrl?: string;
  profileImageUrl?: string;
  courier?: {
    profileImageUrl?: string | null;
  };
}

interface LoginErrorResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sessionStorageKey = 'courier_session';
  private readonly http = inject(HttpClient);
  private readonly authApiBase = 'http://localhost:5116';
  private readonly catalogsApiBase = 'http://localhost:5009';
  private readonly loginCourierEndpoint = '/api/Auth/login-courier';
  private readonly courierByAuthUserEndpoint = '/api/Catalogs/couriers/by-auth-user';

  loginCourier(payload: LoginCourierRequest): Observable<LoginCourierResponse> {
    return this.http
      .post<LoginCourierResponse>(`${this.authApiBase}${this.loginCourierEndpoint}`, payload)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.status === 401) {
            const errorBody = error.error as LoginErrorResponse | null;
            return throwError(() => new Error(errorBody?.message ?? 'Invalid credentials'));
          }

          return throwError(() => new Error('No fue posible iniciar sesión. Intenta de nuevo.'));
        })
      );
  }

  getCourierByAuthUserId(authUserId: string): Observable<CourierByAuthUserResponse> {
    return this.http
      .get<CourierByAuthUserResponse>(
        `${this.catalogsApiBase}${this.courierByAuthUserEndpoint}/${encodeURIComponent(authUserId)}`
      )
      .pipe(
        catchError(() =>
          throwError(
            () => new Error('Se autenticó el usuario, pero no se pudo cargar la información del courier.')
          )
        )
      );
  }

  uploadCourierProfileImage(
    courierId: string,
    file: File
  ): Observable<UploadCourierProfileImageResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http
      .post<UploadCourierProfileImageResponse>(
        `${this.catalogsApiBase}/api/Catalogs/couriers/${encodeURIComponent(courierId)}/profile-image`,
        formData
      )
      .pipe(
        catchError(() =>
          throwError(() => new Error('No fue posible subir la imagen de perfil. Intenta de nuevo.'))
        )
      );
  }

  getSession(): CourierSession | null {
    const sessionRaw = localStorage.getItem(this.sessionStorageKey);
    if (!sessionRaw) {
      return null;
    }

    try {
      const parsedSession = JSON.parse(sessionRaw) as Partial<CourierSession>;
      if (
        !parsedSession.authUser ||
        !parsedSession.courier ||
        typeof parsedSession.authUser.id !== 'string' ||
        typeof parsedSession.authUser.email !== 'string' ||
        typeof parsedSession.courier.id !== 'string'
      ) {
        this.clearSession();
        return null;
      }

      return parsedSession as CourierSession;
    } catch {
      this.clearSession();
      return null;
    }
  }

  hasValidSession(): boolean {
    return this.getSession() !== null;
  }

  persistSession(session: CourierSession): void {
    localStorage.setItem(this.sessionStorageKey, JSON.stringify(session));
  }

  clearSession(): void {
    localStorage.removeItem(this.sessionStorageKey);
  }
}
