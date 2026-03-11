import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, map, switchMap } from 'rxjs';
import { AuthService, CourierSession } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly loginForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    this.authService
      .loginCourier(this.loginForm.getRawValue())
      .pipe(
        switchMap((authUser) =>
          this.authService.getCourierByAuthUserId(authUser.id).pipe(
            map((courierResponse) => ({
              authUser,
              courier: courierResponse.courier
            }))
          )
        ),
        finalize(() => this.isSubmitting.set(false))
      )
      .subscribe({
        next: (session) => this.onLoginSuccess(session),
        error: (error: Error) => this.errorMessage.set(error.message)
      });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((currentValue) => !currentValue);
  }

  hasError(controlName: 'email' | 'password', errorName: string): boolean {
    const control = this.loginForm.controls[controlName];
    return control.touched && control.hasError(errorName);
  }

  private onLoginSuccess(session: CourierSession): void {
    this.authService.persistSession(session);
    void this.router.navigateByUrl(this.resolveReturnUrl());
  }

  private resolveReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (typeof returnUrl === 'string' && returnUrl.startsWith('/app')) {
      return returnUrl;
    }

    return '/app/dashboard';
  }
}
