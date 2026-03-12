import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface ShippingAddress {
  title: string;
  street: string;
  neighbourhood: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
}

export interface OrderSummary {
  id: string;
  userId: string;
  userName?: string | null;
  userPhone?: string | null;
  userAddressId: number;
  shippingAddress: ShippingAddress;
  userPaymentMethodId: number;
  pickupDate: string;
  pickupTime: string;
  isPostPayment: boolean;
  postPaymentMethod: string;
  status: number;
  totalAmount: number;
  deliveryFee: number;
  courierName: string;
  courierPhone: string;
  courierGuid: string | null;
  createdAt: string;
  recollectedAt: string | null;
  deliveredAt: string | null;
}

export interface OrderDetail {
  id: string;
  orderId: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  servicePrice: number;
  uoM: string;
  subTotal: number;
}

export interface OrderListItem {
  order: OrderSummary;
  orderDetails: OrderDetail[];
}

export interface AssignCourierRequest {
  courierGuid: string;
  courierName: string;
  courierPhone: string;
}

export interface UpdateOrderStatusRequest {
  status: number;
}

export interface UploadOrderEvidenceRequest {
  file: File;
  note?: string | null;
  courierId?: string | null;
}

export interface OrderEvidence {
  id: string;
  orderId: string;
  orderStatusEvidence: number;
  courierId: string | null;
  fileUrl: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  createdAt: string;
}

export interface CourierCompletedOrdersByDay {
  date: string;
  count: number;
}

export interface CourierRecentCompletedOrder {
  orderId: string;
  completedAt: string;
  deliveryFee: number;
}

export interface CourierKpis {
  completedOrdersCount: number;
  totalEarned: number;
  completedOrdersByDay: CourierCompletedOrdersByDay[];
  recentCompletedOrders: CourierRecentCompletedOrder[];
}

interface OrdersResponse {
  message: string;
  data: OrderListItem[];
}

interface AssignCourierResponse {
  message: string;
}

interface UpdateOrderStatusResponse {
  message: string;
  status: number;
}

interface UploadOrderEvidenceResponse {
  message: string;
  evidence: OrderEvidence;
}

interface CourierKpisResponse {
  message: string;
  data: CourierKpis;
}

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly ordersApiUrl = environment.ordersApiUrl;
  private readonly unassignedOrdersEndpoint = '/unassigned';

  getUnassignedOrders(): Observable<OrderListItem[]> {
    return this.http
      .get<OrdersResponse>(`${this.ordersApiUrl}${this.unassignedOrdersEndpoint}`)
      .pipe(
        map((response) => response.data ?? []),
        catchError(() =>
          throwError(() => new Error('No fue posible cargar los pedidos disponibles.'))
        )
      );
  }

  getOrdersByCourier(courierGuid: string): Observable<OrderListItem[]> {
    return this.http
      .get<OrdersResponse>(`${this.ordersApiUrl}/courier/${encodeURIComponent(courierGuid)}`)
      .pipe(
        map((response) => response.data ?? []),
        catchError(() =>
          throwError(() => new Error('No fue posible cargar los pedidos asignados.'))
        )
      );
  }

  getCourierKpis(courierGuid: string): Observable<CourierKpis> {
    return this.http
      .get<CourierKpisResponse>(`${this.ordersApiUrl}/courier/${encodeURIComponent(courierGuid)}/kpis`)
      .pipe(
        map((response) => response.data),
        catchError(() =>
          throwError(() => new Error('No fue posible cargar los KPIs del dashboard.'))
        )
      );
  }

  getOrderByIdForCourier(courierGuid: string, orderId: string): Observable<OrderListItem> {
    return this.getOrdersByCourier(courierGuid).pipe(
      map((orders) => {
        const orderItem = orders.find((item) => item.order.id === orderId);
        if (!orderItem) {
          throw new Error('No se encontró el pedido solicitado en tu ruta.');
        }

        return orderItem;
      })
    );
  }

  assignCourier(orderId: string, payload: AssignCourierRequest): Observable<string> {
    return this.http
      .patch<AssignCourierResponse>(
        `${this.ordersApiUrl}/${encodeURIComponent(orderId)}/assign-courier`,
        payload
      )
      .pipe(
        map((response) => response.message ?? 'Courier assigned successfully'),
        catchError(() =>
          throwError(() => new Error('No fue posible asignarte este pedido.'))
        )
      );
  }

  updateOrderStatus(orderId: string, payload: UpdateOrderStatusRequest): Observable<number> {
    return this.http
      .patch<UpdateOrderStatusResponse>(
        `${this.ordersApiUrl}/${encodeURIComponent(orderId)}/status`,
        payload
      )
      .pipe(
        map((response) => response.status),
        catchError(() =>
          throwError(() => new Error('No fue posible actualizar el estatus del pedido.'))
        )
      );
  }

  getOrderEvidences(orderId: string): Observable<OrderEvidence[]> {
    return this.http
      .get<OrderEvidence[]>(`${this.ordersApiUrl}/${encodeURIComponent(orderId)}/evidences`)
      .pipe(
        map((response) => response ?? []),
        catchError(() =>
          throwError(() => new Error('No fue posible cargar las evidencias del pedido.'))
        )
      );
  }

  uploadOrderEvidence(
    orderId: string,
    payload: UploadOrderEvidenceRequest
  ): Observable<OrderEvidence> {
    const formData = new FormData();
    formData.append('File', payload.file);

    const note = payload.note?.trim();
    if (note) {
      formData.append('Note', note);
    }

    const courierId = payload.courierId?.trim();
    if (courierId) {
      formData.append('CourierId', courierId);
    }

    return this.http
      .post<UploadOrderEvidenceResponse>(
        `${this.ordersApiUrl}/${encodeURIComponent(orderId)}/evidences`,
        formData
      )
      .pipe(
        map((response) => response.evidence),
        catchError(() =>
          throwError(() => new Error('No fue posible subir la evidencia del pedido.'))
        )
      );
  }

  getOrderEvidenceImageUrl(evidenceId: string): string {
    return `${this.ordersApiUrl}/evidences/${encodeURIComponent(evidenceId)}/image`;
  }
}
