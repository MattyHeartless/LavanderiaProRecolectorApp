import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, map, of, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AuthService,
  CourierSession,
  UploadCourierProfileImageResponse
} from '../../core/auth/auth.service';

@Component({
  selector: 'app-perfil',
  imports: [],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css'
})
export class PerfilComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly catalogsApiOrigin = this.getApiOrigin(environment.catalogsApiUrl);
  private readonly defaultProfileImageUrl =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuB-FIwz5nD2II8samNTDzqtBp1HndIbXGmyetVFiEh-bJA4xgRZ8pkWvAiI4YknU_ubQnon2r4VSVYVYJdMdQbjD6eA7N3Ln9WRRS9Mvb-jAu58EaZ-yVuhMtm6-fQyQ_JKBiK9wOuEuaasYyQnL8Zn0zq5EnXPDZeWEr44toKMspZrAuPO4wFqUOj1Xbsm4yo6ww88v9hv32Hsef-DEPQeePUbPnBoHUFZdz0usatrQspv6OR1thQwSnKVjS8GpDtmLqotnFnbkgM';

  showLogoutModal = false;
  showCurrentPassword = false;
  showNewPassword = false;
  readonly isUploadingProfileImage = signal(false);
  readonly profileImageError = signal<string | null>(null);
  readonly fullName = signal('Recolector');
  readonly email = signal('sin-correo@correo.com');
  readonly phoneNumber = signal('Sin teléfono');
  readonly profileImageUrl = signal(this.defaultProfileImageUrl);

  constructor() {
    this.loadCourierProfile();
  }

  openLogoutModal(): void {
    this.showLogoutModal = true;
  }

  cancelLogout(): void {
    this.showLogoutModal = false;
  }

  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword = !this.showNewPassword;
  }

  onProfileImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const selectedFile = input?.files?.[0];
    if (!selectedFile) {
      return;
    }

    const session = this.authService.getSession();
    if (!session?.courier?.id) {
      this.profileImageError.set('No se encontró la sesión del courier.');
      if (input) {
        input.value = '';
      }
      return;
    }

    this.profileImageError.set(null);
    this.isUploadingProfileImage.set(true);

    this.authService
      .uploadCourierProfileImage(session.courier.id, selectedFile)
      .pipe(
        switchMap((uploadResponse) => {
          const uploadedImageUrl = this.extractUploadedImageUrl(uploadResponse);

          if (uploadedImageUrl) {
            const updatedSession: CourierSession = {
              ...session,
              courier: {
                ...session.courier,
                profileImageUrl: uploadedImageUrl
              }
            };

            this.persistSession(updatedSession);
            this.profileImageUrl.set(this.resolveImageUrl(uploadedImageUrl));
            return of(null);
          }

          return this.authService.getCourierByAuthUserId(session.authUser.id).pipe(
            map((courierResponse) => {
              const updatedSession: CourierSession = {
                ...session,
                courier: courierResponse.courier
              };

              this.persistSession(updatedSession);

              const profileImageUrl = courierResponse.courier.profileImageUrl;
              if (typeof profileImageUrl === 'string' && profileImageUrl.trim().length > 0) {
                this.profileImageUrl.set(this.resolveImageUrl(profileImageUrl));
              }

              return null;
            })
          );
        }),
        finalize(() => {
          this.isUploadingProfileImage.set(false);
          if (input) {
            input.value = '';
          }
        })
      )
      .subscribe({
        error: (error: Error) => this.profileImageError.set(error.message)
      });
  }

  confirmLogout(): void {
    this.showLogoutModal = false;
    this.authService.clearSession();
    void this.router.navigateByUrl('/login');
  }

  private loadCourierProfile(): void {
    const session = this.authService.getSession();
    if (!session) {
      return;
    }

    const names = [session.courier.name, session.courier.middleName, session.courier.lastName].filter(
      (name): name is string => typeof name === 'string' && name.trim().length > 0
    );

    if (names.length > 0) {
      this.fullName.set(names.join(' '));
    }

    if (typeof session.authUser.email === 'string' && session.authUser.email.trim().length > 0) {
      this.email.set(session.authUser.email);
    }

    if (
      typeof session.courier.phoneNumber === 'string' &&
      session.courier.phoneNumber.trim().length > 0
    ) {
      this.phoneNumber.set(session.courier.phoneNumber);
    }

    if (
      typeof session.courier.profileImageUrl === 'string' &&
      session.courier.profileImageUrl.trim().length > 0
    ) {
      this.profileImageUrl.set(this.resolveImageUrl(session.courier.profileImageUrl));
    }
  }

  private extractUploadedImageUrl(response: UploadCourierProfileImageResponse): string | null {
    const possibleUrls = [response.imageUrl, response.profileImageUrl, response.courier?.profileImageUrl];
    const firstValidUrl = possibleUrls.find(
      (url): url is string => typeof url === 'string' && url.trim().length > 0
    );

    return firstValidUrl ?? null;
  }

  private resolveImageUrl(urlOrPath: string): string {
    const trimmedValue = urlOrPath.trim();
    if (/^https?:\/\//i.test(trimmedValue)) {
      return trimmedValue;
    }

    if (trimmedValue.startsWith('/')) {
      return `${this.catalogsApiOrigin}${trimmedValue}`;
    }

    return `${this.catalogsApiOrigin}/${trimmedValue}`;
  }

  private persistSession(session: CourierSession): void {
    this.authService.persistSession(session);
  }

  private getApiOrigin(url: string): string {
    return url.replace(/\/api\/[^/]+\/?$/i, '');
  }
}
