import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { OrdersService } from '../../core/orders/orders.service';

enum EvidenceStageStatus {
  Recollecting = 3,
  Processing = 4,
  Delivering = 5,
  Completed = 6
}

interface EvidenceStageConfig {
  status: EvidenceStageStatus;
  stepNumber: number;
  title: string;
  description: string;
  helperText: string;
  uploadButtonLabel: string;
}

@Component({
  selector: 'app-evidencia-camara',
  imports: [RouterLink],
  templateUrl: './evidencia-camara.component.html',
  styleUrl: './evidencia-camara.component.css'
})
export class EvidenciaCamaraComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);
  private navigationTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private readonly stageConfigByStatus: Record<EvidenceStageStatus, EvidenceStageConfig> = {
    [EvidenceStageStatus.Recollecting]: {
      status: EvidenceStageStatus.Recollecting,
      stepNumber: 1,
      title: 'Foto de prendas recolectadas',
      description: 'Captura la evidencia inicial al recoger el pedido.',
      helperText: 'Encuadra las prendas y el sello de seguridad dentro del recuadro.',
      uploadButtonLabel: 'Subir evidencia de recolección'
    },
    [EvidenceStageStatus.Processing]: {
      status: EvidenceStageStatus.Processing,
      stepNumber: 2,
      title: 'Foto para lavado',
      description: 'Registra el pedido antes de ingresarlo al proceso.',
      helperText: 'Asegúrate de que el contenido y el estado del paquete sean visibles.',
      uploadButtonLabel: 'Subir evidencia de lavado'
    },
    [EvidenceStageStatus.Delivering]: {
      status: EvidenceStageStatus.Delivering,
      stepNumber: 3,
      title: 'Foto previa a entrega',
      description: 'Documenta el pedido cuando ya está listo para entregarse.',
      helperText: 'Toma la foto con buena iluminación antes de la entrega al cliente.',
      uploadButtonLabel: 'Subir evidencia de entrega'
    },
    [EvidenceStageStatus.Completed]: {
      status: EvidenceStageStatus.Completed,
      stepNumber: 4,
      title: 'Foto de cierre',
      description: 'Sube la evidencia final del pedido completado.',
      helperText: 'Procura mostrar el paquete entregado y cualquier confirmación visible.',
      uploadButtonLabel: 'Subir evidencia final'
    }
  };

  pedidoId = '';
  evidenceStage: EvidenceStageStatus | null = null;
  note = '';
  readonly isUploading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);

  ngOnInit(): void {
    this.pedidoId = this.route.snapshot.paramMap.get('id') ?? '';

    const stageParam = Number(this.route.snapshot.queryParamMap.get('etapa'));
    this.evidenceStage = this.isValidEvidenceStage(stageParam) ? stageParam : null;

    if (this.pedidoId.trim().length === 0 || this.evidenceStage === null) {
      this.errorMessage.set('No se pudo identificar la evidencia que deseas capturar.');
    }

    this.scrollToTop();
  }

  ngOnDestroy(): void {
    this.revokePreviewUrl();

    if (this.navigationTimeoutId !== null) {
      clearTimeout(this.navigationTimeoutId);
    }
  }

  get stageConfig(): EvidenceStageConfig | null {
    return this.evidenceStage !== null ? this.stageConfigByStatus[this.evidenceStage] : null;
  }

  get progressWidth(): string {
    const currentStep = this.stageConfig?.stepNumber ?? 0;
    return `${(currentStep / 4) * 100}%`;
  }

  get canSubmitEvidence(): boolean {
    return (
      this.evidenceStage !== null &&
      this.pedidoId.trim().length > 0 &&
      this.selectedFile() !== null &&
      !this.isUploading()
    );
  }

  get selectedFileName(): string {
    return this.selectedFile()?.name ?? 'Sin archivo seleccionado';
  }

  get selectedFileSizeLabel(): string {
    const file = this.selectedFile();
    if (!file) {
      return 'Captura o selecciona una foto para continuar.';
    }

    if (file.size < 1024 * 1024) {
      return `${Math.max(1, Math.round(file.size / 1024))} KB`;
    }

    return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (!file) {
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.selectedFile.set(file);
    this.setPreviewUrl(file);

    if (input) {
      input.value = '';
    }
  }

  removeSelectedFile(): void {
    this.selectedFile.set(null);
    this.revokePreviewUrl();
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  updateNote(value: string): void {
    this.note = value;
  }

  submitEvidence(): void {
    const selectedFile = this.selectedFile();
    const session = this.authService.getSession();
    if (!selectedFile || this.evidenceStage === null || this.pedidoId.trim().length === 0) {
      this.errorMessage.set('Selecciona una foto válida antes de subir la evidencia.');
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.isUploading.set(true);

    this.ordersService
      .uploadOrderEvidence(this.pedidoId, {
        file: selectedFile,
        note: this.note,
        courierId: session?.courier?.id ?? null
      })
      .pipe(finalize(() => this.isUploading.set(false)))
      .subscribe({
        next: () => {
          this.successMessage.set('Evidencia subida correctamente. Regresando al detalle...');
          this.navigationTimeoutId = setTimeout(() => {
            void this.router.navigate(['/app/ruta/detalle', this.pedidoId], {
              queryParams: { updatedEvidenceAt: Date.now() }
            });
          }, 900);
        },
        error: (error: Error) => this.errorMessage.set(error.message)
      });
  }

  private isValidEvidenceStage(value: number): value is EvidenceStageStatus {
    return Object.values(EvidenceStageStatus).includes(value);
  }

  private setPreviewUrl(file: File): void {
    this.revokePreviewUrl();
    this.previewUrl.set(URL.createObjectURL(file));
  }

  private revokePreviewUrl(): void {
    const currentPreviewUrl = this.previewUrl();
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      this.previewUrl.set(null);
    }
  }

  private scrollToTop(): void {
    if (typeof window === 'undefined') {
      return;
    }

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }
}
