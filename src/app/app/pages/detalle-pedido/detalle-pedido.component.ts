import { DecimalPipe, NgClass } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  OrderDetail,
  OrderEvidence,
  OrderListItem,
  OrdersService
} from '../../core/orders/orders.service';

export enum OrderStatus {
  Created = 1,
  Paid = 2,
  Recollecting = 3,
  Processing = 4,
  Delivering = 5,
  Completed = 6,
  Cancelled = 7
}

type TimelineState = 'completed' | 'current' | 'pending' | 'cancelled';

interface OrderTimelineStep {
  status: OrderStatus;
  label: string;
  description: string;
  icon: string;
}

interface OrderStatusAction {
  icon: string;
  label: string;
  nextStatus: OrderStatus;
}

interface MapPreviewTile {
  id: string;
  src: string;
  left: number;
  top: number;
}

@Component({
  selector: 'app-detalle-pedido',
  imports: [RouterLink, NgClass, DecimalPipe],
  templateUrl: './detalle-pedido.component.html',
  styleUrl: './detalle-pedido.component.css'
})
export class DetallePedidoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);
  private readonly mapPreviewZoom = 16;
  private readonly mapTileSize = 256;
  private readonly pickupDateFormatter = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  readonly orderStatuses = OrderStatus;
  readonly timelineSteps: OrderTimelineStep[] = [
    {
      status: OrderStatus.Created,
      label: 'Creado',
      description: 'La orden fue registrada.',
      icon: 'receipt_long'
    },
    {
      status: OrderStatus.Paid,
      label: 'Pagado',
      description: 'Pago validado correctamente.',
      icon: 'payments'
    },
    {
      status: OrderStatus.Recollecting,
      label: 'Recolección',
      description: 'Recolector en camino y levantando paquetes.',
      icon: 'inventory_2'
    },
    {
      status: OrderStatus.Processing,
      label: 'Procesando',
      description: 'Prendas en proceso dentro de planta.',
      icon: 'local_laundry_service'
    },
    {
      status: OrderStatus.Delivering,
      label: 'Entregando',
      description: 'Pedido en ruta para entrega final.',
      icon: 'local_shipping'
    },
    {
      status: OrderStatus.Completed,
      label: 'Completado',
      description: 'Pedido entregado y finalizado.',
      icon: 'task_alt'
    },
    {
      status: OrderStatus.Cancelled,
      label: 'Cancelado',
      description: 'La orden fue cancelada.',
      icon: 'cancel'
    }
  ];
  readonly evidenceStatuses: OrderStatus[] = [
    OrderStatus.Recollecting,
    OrderStatus.Processing,
    OrderStatus.Delivering
  ];

  pedidoId = '';
  currentStatus: OrderStatus = OrderStatus.Created;
  evidenceModalCapturedAt = '';
  evidenceModalImageUrl = '';
  evidenceModalNote = '';
  evidenceModalTitle = '';
  showEvidenceModal = false;
  readonly isLoading = signal(false);
  readonly isUpdatingStatus = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly statusActionErrorMessage = signal<string | null>(null);
  readonly orderItem = signal<OrderListItem | null>(null);
  readonly evidences = signal<OrderEvidence[]>([]);
  readonly evidenceByStatus = computed(() => {
    const groupedEvidence = new Map<OrderStatus, OrderEvidence>();

    for (const evidence of this.evidences()) {
      if (!this.isValidStatus(evidence.orderStatusEvidence)) {
        continue;
      }

      if (!groupedEvidence.has(evidence.orderStatusEvidence)) {
        groupedEvidence.set(evidence.orderStatusEvidence, evidence);
      }
    }

    return groupedEvidence;
  });
  readonly hasMapCoordinates = computed(() => {
    const order = this.orderItem()?.order;
    return (
      typeof order?.shippingAddress.latitude === 'number' &&
      Number.isFinite(order.shippingAddress.latitude) &&
      typeof order?.shippingAddress.longitude === 'number' &&
      Number.isFinite(order.shippingAddress.longitude)
    );
  });
  readonly mapPreview = computed(() => {
    const order = this.orderItem()?.order;
    if (
      !order ||
      typeof order.shippingAddress.latitude !== 'number' ||
      !Number.isFinite(order.shippingAddress.latitude) ||
      typeof order.shippingAddress.longitude !== 'number' ||
      !Number.isFinite(order.shippingAddress.longitude)
    ) {
      return null;
    }

    const worldPixel = this.projectCoordinateToWorldPixel(
      order.shippingAddress.latitude,
      order.shippingAddress.longitude,
      this.mapPreviewZoom
    );
    const tileX = Math.floor(worldPixel.x / this.mapTileSize);
    const tileY = Math.floor(worldPixel.y / this.mapTileSize);
    const startTileX = tileX - 1;
    const startTileY = tileY - 1;
    const centerPixelX = worldPixel.x - startTileX * this.mapTileSize;
    const centerPixelY = worldPixel.y - startTileY * this.mapTileSize;
    const tilesPerAxis = 2 ** this.mapPreviewZoom;
    const tiles: MapPreviewTile[] = [];

    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const currentTileX = startTileX + column;
        const currentTileY = startTileY + row;

        if (currentTileY < 0 || currentTileY >= tilesPerAxis) {
          continue;
        }

        const wrappedTileX =
          ((currentTileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;

        tiles.push({
          id: `${wrappedTileX}-${currentTileY}`,
          src: `https://tile.openstreetmap.org/${this.mapPreviewZoom}/${wrappedTileX}/${currentTileY}.png`,
          left: column * this.mapTileSize,
          top: row * this.mapTileSize
        });
      }
    }

    return {
      tiles,
      transform: `translate(${-centerPixelX}px, ${-centerPixelY}px)`
    };
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.pedidoId = idParam ?? '';
    this.loadOrderDetails();
  }

  get pedidoDisplayId(): string {
    if (this.pedidoId.trim().length === 0) {
      return 'SIN-ID';
    }

    return this.pedidoId.split('-')[0].toUpperCase();
  }

  get currentStatusLabel(): string {
    return this.getStatusLabel(this.currentStatus);
  }

  get serviceCount(): number {
    return this.orderItem()?.orderDetails.length ?? 0;
  }

  get serviceSummary(): string {
    const orderDetails = this.orderItem()?.orderDetails ?? [];
    if (orderDetails.length === 0) {
      return 'Sin servicios';
    }

    if (orderDetails.length === 1) {
      return this.formatService(orderDetails[0]);
    }

    return `${orderDetails.length} servicios incluidos`;
  }

  get pickupScheduleLabel(): string {
    const order = this.orderItem()?.order;
    if (!order) {
      return '--';
    }

    return this.formatPickupDateTime(order.pickupDate, order.pickupTime);
  }

  get paymentSummary(): string {
    const order = this.orderItem()?.order;
    if (!order) {
      return '--';
    }

    return order.isPostPayment
      ? `Contra entrega${order.postPaymentMethod ? ` · ${order.postPaymentMethod}` : ''}`
      : 'Pago anticipado';
  }

  get customerName(): string {
    const userName = this.orderItem()?.order.userName?.trim();
    return userName && userName.length > 0 ? userName : 'Cliente sin snapshot';
  }

  get customerPhone(): string {
    const phone = this.normalizedCustomerPhone;
    return phone ?? 'Sin teléfono disponible';
  }

  get canCallCustomer(): boolean {
    return this.normalizedCustomerPhone !== null;
  }

  get customerCallLink(): string | null {
    const phone = this.normalizedCustomerPhone;
    return phone ? `tel:${phone}` : null;
  }

  get navigationLink(): string | null {
    const order = this.orderItem()?.order;
    if (
      !order ||
      typeof order.shippingAddress.latitude !== 'number' ||
      !Number.isFinite(order.shippingAddress.latitude) ||
      typeof order.shippingAddress.longitude !== 'number' ||
      !Number.isFinite(order.shippingAddress.longitude)
    ) {
      return null;
    }

    const destination = `${order.shippingAddress.latitude},${order.shippingAddress.longitude}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  }

  get addressLinePrimary(): string {
    const address = this.orderItem()?.order.shippingAddress;
    if (!address) {
      return 'Dirección no disponible';
    }

    return [address.title, address.street].filter(Boolean).join(' · ');
  }

  get addressLineSecondary(): string {
    const address = this.orderItem()?.order.shippingAddress;
    if (!address) {
      return '';
    }

    return [address.neighbourhood, address.city, address.state, address.zipCode]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join(', ');
  }

  get canCaptureEvidenceCurrentStatus(): boolean {
    return this.canCaptureEvidenceAt(this.currentStatus);
  }

  get nextStatusAction(): OrderStatusAction | null {
    switch (this.currentStatus) {
      case OrderStatus.Created:
      case OrderStatus.Paid:
        return {
          nextStatus: OrderStatus.Recollecting,
          label: 'Ya voy en camino',
          icon: 'directions_car'
        };
      case OrderStatus.Recollecting:
        if (!this.hasEvidenceForStatus(OrderStatus.Recollecting)) {
          return null;
        }
        return {
          nextStatus: OrderStatus.Processing,
          label: 'Lo llevaré a lavar',
          icon: 'local_laundry_service'
        };
      case OrderStatus.Processing:
        if (!this.hasEvidenceForStatus(OrderStatus.Processing)) {
          return null;
        }
        return {
          nextStatus: OrderStatus.Delivering,
          label: 'Ya terminé',
          icon: 'local_shipping'
        };
      case OrderStatus.Delivering:
        if (!this.hasEvidenceForStatus(OrderStatus.Delivering)) {
          return null;
        }
        return {
          nextStatus: OrderStatus.Completed,
          label: 'Completado',
          icon: 'task_alt'
        };
      default:
        return null;
    }
  }

  get evidenceTitle(): string {
    switch (this.currentStatus) {
      case OrderStatus.Recollecting:
        return 'Evidencia de Recolección';
      case OrderStatus.Processing:
        return 'Evidencia de Procesamiento';
      case OrderStatus.Delivering:
        return 'Evidencia de Entrega en Ruta';
      default:
        return 'Evidencia no disponible';
    }
  }

  get evidenceDescription(): string {
    switch (this.currentStatus) {
      case OrderStatus.Recollecting:
        return 'Captura fotos al momento de recolectar los paquetes en domicilio.';
      case OrderStatus.Processing:
        return 'Adjunta evidencia del proceso y del estado de las prendas.';
      case OrderStatus.Delivering:
        return 'Registra evidencia antes y durante la entrega al cliente.';
      default:
        return 'La toma de evidencia se habilita en los estados 3, 4 y 5.';
    }
  }

  get evidenceActionLabel(): string {
    switch (this.currentStatus) {
      case OrderStatus.Recollecting:
        return 'Capturar Evidencia de Recolección';
      case OrderStatus.Processing:
        return 'Capturar Evidencia de Procesamiento';
      case OrderStatus.Delivering:
        return 'Capturar Evidencia de Entrega';
      default:
        return 'Evidencia no habilitada';
    }
  }

  get requiresEvidenceToContinue(): boolean {
    return (
      (this.currentStatus === OrderStatus.Recollecting ||
        this.currentStatus === OrderStatus.Processing ||
        this.currentStatus === OrderStatus.Delivering) &&
      !this.hasEvidenceForStatus(this.currentStatus)
    );
  }

  get statusActionBlockedLabel(): string {
    if (this.requiresEvidenceToContinue) {
      return 'Sube evidencia para continuar';
    }

    return this.currentStatusLabel;
  }

  get statusPillDotClass(): string {
    switch (this.currentStatus) {
      case OrderStatus.Completed:
        return 'bg-emerald-500';
      case OrderStatus.Cancelled:
        return 'bg-rose-500';
      case OrderStatus.Created:
      case OrderStatus.Paid:
        return 'bg-blue-500';
      default:
        return 'bg-primary';
    }
  }

  get statusPillTextClass(): string {
    switch (this.currentStatus) {
      case OrderStatus.Completed:
        return 'text-emerald-600 dark:text-emerald-400';
      case OrderStatus.Cancelled:
        return 'text-rose-600 dark:text-rose-400';
      case OrderStatus.Created:
      case OrderStatus.Paid:
        return 'text-blue-500';
      default:
        return 'text-primary';
    }
  }

  getTimelineState(status: OrderStatus): TimelineState {
    if (this.currentStatus === OrderStatus.Cancelled) {
      if (status === OrderStatus.Cancelled) {
        return 'cancelled';
      }
      if (status <= OrderStatus.Paid) {
        return 'completed';
      }
      return 'pending';
    }

    if (status < this.currentStatus) {
      return 'completed';
    }
    if (status === this.currentStatus) {
      return 'current';
    }
    return 'pending';
  }

  getTimelineMarkerClass(status: OrderStatus): string {
    const state = this.getTimelineState(status);
    if (state === 'completed') {
      return 'bg-primary border-primary text-slate-900';
    }
    if (state === 'current') {
      return 'bg-primary/15 border-primary text-primary';
    }
    if (state === 'cancelled') {
      return 'bg-rose-100 dark:bg-rose-500/20 border-rose-500 text-rose-500';
    }
    return 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400';
  }

  getTimelineLineClass(status: OrderStatus): string {
    const state = this.getTimelineState(status);
    if (state === 'completed' || state === 'current' || state === 'cancelled') {
      return state === 'cancelled' ? 'bg-rose-400/60' : 'bg-primary/50';
    }
    return 'bg-slate-200 dark:bg-slate-700';
  }

  getTimelineTitleClass(status: OrderStatus): string {
    const state = this.getTimelineState(status);
    if (state === 'pending') {
      return 'text-slate-400 dark:text-slate-500';
    }
    if (state === 'cancelled') {
      return 'text-rose-500';
    }
    return 'text-slate-900 dark:text-slate-100';
  }

  getTimelineSubtitleClass(status: OrderStatus): string {
    const state = this.getTimelineState(status);
    if (state === 'pending') {
      return 'text-slate-400 dark:text-slate-500';
    }
    if (state === 'cancelled') {
      return 'text-rose-500/80';
    }
    return 'text-slate-500 dark:text-slate-400';
  }

  getTimelineIcon(status: OrderStatus): string {
    const step = this.timelineSteps.find((timelineStep) => timelineStep.status === status);
    if (!step) {
      return 'help';
    }

    const state = this.getTimelineState(status);
    if (state === 'completed') {
      return 'check';
    }
    return step.icon;
  }

  showTimelineTime(status: OrderStatus): boolean {
    const state = this.getTimelineState(status);
    return state === 'completed' || state === 'current' || state === 'cancelled';
  }

  getTimelineTime(status: OrderStatus): string {
    const order = this.orderItem()?.order;
    if (!order) {
      return '--:--';
    }

    switch (status) {
      case OrderStatus.Created:
        return this.formatTimestamp(order.createdAt);
      case OrderStatus.Paid:
        if (!order.isPostPayment && order.status >= OrderStatus.Paid) {
          return this.formatTimestamp(order.createdAt);
        }
        return '--:--';
      case OrderStatus.Recollecting:
        return order.recollectedAt
          ? this.formatTimestamp(order.recollectedAt)
          : order.status >= OrderStatus.Recollecting
            ? this.formatPickupTime(order.pickupTime)
            : '--:--';
      case OrderStatus.Processing:
        return order.status >= OrderStatus.Processing && order.recollectedAt
          ? this.formatTimestamp(order.recollectedAt)
          : '--:--';
      case OrderStatus.Delivering:
        return order.status >= OrderStatus.Delivering ? this.formatPickupTime(order.pickupTime) : '--:--';
      case OrderStatus.Completed:
        return order.deliveredAt ? this.formatTimestamp(order.deliveredAt) : '--:--';
      default:
        return '--:--';
    }
  }

  getStatusLabel(status: OrderStatus): string {
    const step = this.timelineSteps.find((timelineStep) => timelineStep.status === status);
    return step?.label ?? 'Sin estado';
  }

  isEvidenceStatus(status: OrderStatus): boolean {
    return this.evidenceStatuses.includes(status);
  }

  canCaptureEvidenceAt(status: OrderStatus): boolean {
    return this.currentStatus === status && this.isEvidenceStatus(status);
  }

  canViewEvidenceAt(status: OrderStatus): boolean {
    return this.isEvidenceStatus(status) && this.hasEvidenceForStatus(status);
  }

  openNavigation(): void {
    const navigationLink = this.navigationLink;
    if (!navigationLink) {
      return;
    }

    window.open(navigationLink, '_blank', 'noopener,noreferrer');
  }

  advanceOrderStatus(): void {
    const orderId = this.orderItem()?.order.id;
    const nextAction = this.nextStatusAction;
    if (!orderId || !nextAction || this.isUpdatingStatus()) {
      return;
    }

    this.statusActionErrorMessage.set(null);
    this.isUpdatingStatus.set(true);

    this.ordersService
      .updateOrderStatus(orderId, { status: nextAction.nextStatus })
      .pipe(finalize(() => this.isUpdatingStatus.set(false)))
      .subscribe({
        next: (updatedStatus) => {
          const resolvedStatus = this.isValidStatus(updatedStatus)
            ? updatedStatus
            : nextAction.nextStatus;

          this.currentStatus = resolvedStatus;
          this.orderItem.update((orderItem) =>
            orderItem
              ? {
                  ...orderItem,
                  order: {
                    ...orderItem.order,
                    status: resolvedStatus
                  }
                }
              : orderItem
          );
        },
        error: (error: Error) => this.statusActionErrorMessage.set(error.message)
      });
  }

  openEvidenceModal(status: OrderStatus): void {
    if (!this.canViewEvidenceAt(status)) {
      return;
    }

    const evidence = this.getEvidenceForStatus(status);
    if (!evidence) {
      return;
    }

    this.evidenceModalTitle = this.getEvidenceTitle(status);
    this.evidenceModalCapturedAt = this.formatEvidenceTimestamp(evidence.createdAt);
    this.evidenceModalImageUrl = this.ordersService.getOrderEvidenceImageUrl(evidence.id);
    this.evidenceModalNote = evidence.note?.trim() ?? '';
    this.showEvidenceModal = true;
  }

  closeEvidenceModal(): void {
    this.showEvidenceModal = false;
    this.evidenceModalNote = '';
  }

  isCompletedStatus(status: OrderStatus): boolean {
    return this.getTimelineState(status) === 'completed';
  }

  private isValidStatus(value: number): value is OrderStatus {
    return this.timelineSteps.some((timelineStep) => timelineStep.status === value);
  }

  private loadOrderDetails(): void {
    const courierGuid = this.authService.getSession()?.courier?.id;
    if (!courierGuid || this.pedidoId.trim().length === 0) {
      this.errorMessage.set('No se pudo identificar el pedido solicitado.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.statusActionErrorMessage.set(null);

    forkJoin({
      orderItem: this.ordersService.getOrderByIdForCourier(courierGuid, this.pedidoId),
      evidences: this.ordersService
        .getOrderEvidences(this.pedidoId)
        .pipe(catchError(() => of([] as OrderEvidence[])))
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ orderItem, evidences }) => {
          this.orderItem.set(orderItem);
          this.evidences.set(this.sortEvidences(evidences));
          this.currentStatus = this.isValidStatus(orderItem.order.status)
            ? orderItem.order.status
            : OrderStatus.Created;
        },
        error: (error: Error) => {
          this.orderItem.set(null);
          this.evidences.set([]);
          this.errorMessage.set(error.message);
        }
      });
  }

  private formatService(detail: OrderDetail): string {
    const quantityLabel = detail.quantity > 0 ? `${detail.quantity} ${detail.uoM}` : detail.uoM;
    return `${detail.serviceName} (${quantityLabel})`;
  }

  private formatPickupDateTime(pickupDate: string, pickupTime: string): string {
    const parsedDate = new Date(`${pickupDate}T${pickupTime}`);
    if (Number.isNaN(parsedDate.getTime())) {
      return `${pickupDate} ${pickupTime}`;
    }

    return `${this.pickupDateFormatter.format(parsedDate)} · ${parsedDate.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })}`;
  }

  private formatPickupTime(pickupTime: string): string {
    const parsedTime = new Date(`1970-01-01T${pickupTime}`);
    if (Number.isNaN(parsedTime.getTime())) {
      return pickupTime;
    }

    return parsedTime.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  private formatTimestamp(value: string | null): string {
    if (!value) {
      return '--:--';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return '--:--';
    }

    return parsedDate.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  private formatEvidenceTimestamp(value: string): string {
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return '--:--';
    }

    return parsedDate.toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  private get normalizedCustomerPhone(): string | null {
    const userPhone = this.orderItem()?.order.userPhone?.trim();
    if (!userPhone) {
      return null;
    }

    return userPhone;
  }

  private hasEvidenceForStatus(status: OrderStatus): boolean {
    return this.evidenceByStatus().has(status);
  }

  private getEvidenceForStatus(status: OrderStatus): OrderEvidence | null {
    return this.evidenceByStatus().get(status) ?? null;
  }

  private getEvidenceTitle(status: OrderStatus): string {
    switch (status) {
      case OrderStatus.Recollecting:
        return 'Evidencia de Recolección';
      case OrderStatus.Processing:
        return 'Evidencia de Procesamiento';
      case OrderStatus.Delivering:
        return 'Evidencia de Entrega en Ruta';
      default:
        return 'Evidencia del pedido';
    }
  }

  private sortEvidences(evidences: OrderEvidence[]): OrderEvidence[] {
    return [...evidences].sort((leftEvidence, rightEvidence) => {
      const leftDate = Date.parse(leftEvidence.createdAt);
      const rightDate = Date.parse(rightEvidence.createdAt);
      return rightDate - leftDate;
    });
  }

  private projectCoordinateToWorldPixel(
    latitude: number,
    longitude: number,
    zoom: number
  ): { x: number; y: number } {
    const sinLatitude = Math.sin((latitude * Math.PI) / 180);
    const scale = this.mapTileSize * 2 ** zoom;

    return {
      x: ((longitude + 180) / 360) * scale,
      y:
        (0.5 -
          Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) *
        scale
    };
  }
}
