import { DecimalPipe, NgClass } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService, CourierSession } from '../../core/auth/auth.service';
import {
  AssignCourierRequest,
  OrderListItem,
  OrdersService
} from '../../core/orders/orders.service';

interface PedidoCard {
  id: string;
  displayId: string;
  horario: string;
  direccion: string;
  tipo: 'normal' | 'programado';
  totalAmount: number;
  deliveryFee: number;
  servicios: string[];
  paymentLabel: string;
  pickupLabel: string;
}

@Component({
  selector: 'app-pedidos',
  imports: [NgClass, DecimalPipe],
  templateUrl: './pedidos.component.html',
  styleUrl: './pedidos.component.css'
})
export class PedidosComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);
  private readonly pickupDateFormatter = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  showAssignModal = false;
  selectedPedido: PedidoCard | null = null;
  expandedPedidoId: string | null = null;
  readonly isLoading = signal(false);
  readonly isAssigning = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly assignErrorMessage = signal<string | null>(null);
  readonly pedidos = signal<PedidoCard[]>([]);

  ngOnInit(): void {
    this.loadPedidos();
  }

  openAssignModal(pedido: PedidoCard): void {
    this.selectedPedido = pedido;
    this.assignErrorMessage.set(null);
    this.showAssignModal = true;
  }

  cancelAssign(): void {
    if (this.isAssigning()) {
      return;
    }

    this.showAssignModal = false;
    this.selectedPedido = null;
    this.assignErrorMessage.set(null);
  }

  confirmAssign(): void {
    const selectedPedido = this.selectedPedido;
    if (!selectedPedido) {
      return;
    }

    const session = this.authService.getSession();
    const payload = this.buildAssignCourierPayload(session);
    if (!payload) {
      this.assignErrorMessage.set('No se encontró una sesión válida para asignar el pedido.');
      return;
    }

    this.assignErrorMessage.set(null);
    this.isAssigning.set(true);

    this.ordersService
      .assignCourier(selectedPedido.id, payload)
      .pipe(finalize(() => this.isAssigning.set(false)))
      .subscribe({
        next: () => {
          this.pedidos.update((pedidos) => pedidos.filter((pedido) => pedido.id !== selectedPedido.id));
          this.showAssignModal = false;
          this.selectedPedido = null;
          void this.router.navigate(['/app/ruta'], {
            queryParams: { pedido: selectedPedido.id }
          });
        },
        error: (error: Error) => this.assignErrorMessage.set(error.message)
      });
  }

  toggleServiceDetails(pedidoId: string): void {
    this.expandedPedidoId = this.expandedPedidoId === pedidoId ? null : pedidoId;
  }

  isServiceDetailsOpen(pedidoId: string): boolean {
    return this.expandedPedidoId === pedidoId;
  }

  loadPedidos(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.ordersService
      .getUnassignedOrders()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (orders) => this.pedidos.set(orders.map((orderItem) => this.mapPedidoCard(orderItem))),
        error: (error: Error) => {
          this.pedidos.set([]);
          this.errorMessage.set(error.message);
        }
      });
  }

  private mapPedidoCard(orderItem: OrderListItem): PedidoCard {
    const { order, orderDetails } = orderItem;

    return {
      id: order.id,
      displayId: this.formatOrderId(order.id),
      horario: this.formatPickupDateTime(order.pickupDate, order.pickupTime),
      direccion: this.formatAddress(order.shippingAddress),
      tipo: this.resolvePickupType(order.pickupDate),
      totalAmount: order.totalAmount,
      deliveryFee: order.deliveryFee,
      servicios: orderDetails.map((detail) => this.formatService(detail)),
      paymentLabel: order.isPostPayment
        ? `Contra entrega${order.postPaymentMethod ? ` · ${order.postPaymentMethod}` : ''}`
        : 'Pago anticipado',
      pickupLabel: order.shippingAddress.title?.trim() || 'Recolección programada'
    };
  }

  private formatOrderId(orderId: string): string {
    return orderId.split('-')[0].toUpperCase();
  }

  private formatPickupDateTime(pickupDate: string, pickupTime: string): string {
    const parsedDate = new Date(`${pickupDate}T${pickupTime}`);
    if (Number.isNaN(parsedDate.getTime())) {
      return `${pickupDate} ${pickupTime}`;
    }

    return `${this.pickupDateFormatter.format(parsedDate)} · ${this.formatTime(parsedDate)}`;
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  private formatAddress(address: OrderListItem['order']['shippingAddress']): string {
    return [
      address.title,
      address.street,
      address.neighbourhood,
      address.city,
      address.state,
      address.zipCode
    ]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join(', ');
  }

  private resolvePickupType(pickupDate: string): PedidoCard['tipo'] {
    const today = new Date();
    const orderDate = new Date(`${pickupDate}T00:00:00`);

    if (
      today.getFullYear() === orderDate.getFullYear() &&
      today.getMonth() === orderDate.getMonth() &&
      today.getDate() === orderDate.getDate()
    ) {
      return 'normal';
    }

    return 'programado';
  }

  private formatService(detail: OrderListItem['orderDetails'][number]): string {
    const quantityLabel = detail.quantity > 0 ? `${detail.quantity} ${detail.uoM}` : detail.uoM;
    return `${detail.serviceName} (${quantityLabel})`;
  }

  private buildAssignCourierPayload(session: CourierSession | null): AssignCourierRequest | null {
    if (!session?.courier?.id) {
      return null;
    }

    const courierName = this.resolveCourierName(session);
    const courierPhone = this.resolveCourierPhone(session);
    if (!courierName || !courierPhone) {
      return null;
    }

    return {
      courierGuid: session.courier.id,
      courierName,
      courierPhone
    };
  }

  private resolveCourierName(session: CourierSession): string | null {
    const fullName = [session.courier.name, session.courier.middleName, session.courier.lastName]
      .filter((name) => typeof name === 'string' && name.trim().length > 0)
      .join(' ')
      .trim();

    if (fullName.length > 0) {
      return fullName;
    }

    const authUserFullName = session.authUser.fullName?.trim();
    return authUserFullName && authUserFullName.length > 0 ? authUserFullName : null;
  }

  private resolveCourierPhone(session: CourierSession): string | null {
    const courierPhone = session.courier.phoneNumber?.trim();
    if (courierPhone && courierPhone.length > 0) {
      return courierPhone;
    }

    const authUserPhone = session.authUser.phoneNumber?.trim();
    return authUserPhone && authUserPhone.length > 0 ? authUserPhone : null;
  }
}
