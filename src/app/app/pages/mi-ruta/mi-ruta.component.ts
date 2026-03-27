import { NgClass } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { OrderListItem, OrdersService } from '../../core/orders/orders.service';
import { OrderStatus } from '../detalle-pedido/detalle-pedido.component';

type LeafletModule = typeof import('leaflet');
type LeafletImport = LeafletModule & { default?: LeafletModule };

interface TareaRuta {
  id: string;
  displayId: string;
  direccion: string;
  tipo: string;
  hora: string;
  estado: string;
  estadoClase: string;
  iconContainerClass: string;
  iconClass: string;
  dotClass: string;
  cardClass: string;
  icon: string;
  highlighted: boolean;
  latitude: number | null;
  longitude: number | null;
}

@Component({
  selector: 'app-mi-ruta',
  imports: [RouterLink, NgClass],
  templateUrl: './mi-ruta.component.html',
  styleUrl: './mi-ruta.component.css'
})
export class MiRutaComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);
  private readonly pickupDateFormatter = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  @ViewChild('routeMapContainer') private routeMapContainer?: ElementRef<HTMLDivElement>;

  private leaflet?: LeafletModule;
  private map?: import('leaflet').Map;
  private mapMarkersLayer?: import('leaflet').LayerGroup;

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly tareas = signal<TareaRuta[]>([]);
  readonly hasRouteCoordinates = computed(() =>
    this.tareas().some((tarea) => this.hasCoordinates(tarea))
  );
  readonly routeMapSummary = computed(() => {
    const pointsCount = this.tareas().filter((tarea) => this.hasCoordinates(tarea)).length;
    if (pointsCount === 0) {
      return 'Sin puntos para mostrar';
    }

    if (pointsCount === 1) {
      return '1 punto activo en tu ruta';
    }

    return `${pointsCount} puntos activos en tu ruta`;
  });

  ngOnInit(): void {
    this.loadAssignedOrders();
  }

  ngAfterViewInit(): void {
    void this.initializeMap();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  loadAssignedOrders(): void {
    const session = this.authService.getSession();
    const courierGuid = session?.courier?.id;
    if (!courierGuid) {
      this.tareas.set([]);
      this.errorMessage.set('No se encontró una sesión válida para cargar tu ruta.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.ordersService
      .getOrdersByCourier(courierGuid)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (orders) => {
          const highlightedOrderId = this.route.snapshot.queryParamMap.get('pedido');
          this.tareas.set(
            orders.map((orderItem) => this.mapTareaRuta(orderItem, highlightedOrderId))
          );
          void this.renderRouteOnMap();
        },
        error: (error: Error) => {
          this.tareas.set([]);
          this.errorMessage.set(error.message);
          void this.renderRouteOnMap();
        }
      });
  }

  private mapTareaRuta(orderItem: OrderListItem, highlightedOrderId: string | null): TareaRuta {
    const { order } = orderItem;
    const statusConfig = this.resolveStatusConfig(order.status, order.id === highlightedOrderId);

    return {
      id: order.id,
      displayId: this.formatOrderId(order.id),
      direccion: this.formatAddress(order.shippingAddress),
      tipo: this.resolveTaskType(order.status),
      hora: this.formatPickupDateTime(order.pickupDate, order.pickupTime),
      estado: statusConfig.label,
      estadoClase: statusConfig.labelClass,
      iconContainerClass: statusConfig.iconContainerClass,
      iconClass: statusConfig.iconClass,
      dotClass: statusConfig.dotClass,
      cardClass: statusConfig.cardClass,
      icon: statusConfig.icon,
      highlighted: order.id === highlightedOrderId,
      latitude: this.parseCoordinate(order.shippingAddress.latitude),
      longitude: this.parseCoordinate(order.shippingAddress.longitude)
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

    return `${this.pickupDateFormatter.format(parsedDate)} · ${parsedDate.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })}`;
  }

  private formatAddress(address: OrderListItem['order']['shippingAddress']): string {
    return [address.title, address.street, address.neighbourhood, address.city, address.state]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join(', ');
  }

  private resolveTaskType(status: number): string {
    if (status >= OrderStatus.Delivering) {
      return 'Entrega';
    }

    return 'Recolección';
  }

  private resolveStatusConfig(status: number, highlighted: boolean) {
    if (highlighted) {
      return {
        label: 'Asignado ahora',
        labelClass: 'text-primary',
        iconContainerClass: 'bg-primary/20',
        iconClass: 'text-primary',
        dotClass: 'bg-primary animate-pulse',
        cardClass: 'border-l-4 border-primary',
        icon: 'front_hand'
      };
    }

    switch (status) {
      case OrderStatus.Completed:
        return {
          label: 'Completado',
          labelClass: 'text-emerald-500',
          iconContainerClass: 'bg-emerald-500/10',
          iconClass: 'text-emerald-500',
          dotClass: 'bg-emerald-500',
          cardClass: 'border border-emerald-200 dark:border-emerald-900/40',
          icon: 'task_alt'
        };
      case OrderStatus.Cancelled:
        return {
          label: 'Cancelado',
          labelClass: 'text-rose-500',
          iconContainerClass: 'bg-rose-500/10',
          iconClass: 'text-rose-500',
          dotClass: 'bg-rose-500',
          cardClass: 'border border-rose-200 dark:border-rose-900/40',
          icon: 'cancel'
        };
      case OrderStatus.Recollecting:
      case OrderStatus.Processing:
      case OrderStatus.Delivering:
        return {
          label: 'En curso',
          labelClass: 'text-primary',
          iconContainerClass: 'bg-primary/20',
          iconClass: 'text-primary',
          dotClass: 'bg-primary animate-pulse',
          cardClass: 'border-l-4 border-primary',
          icon: status >= OrderStatus.Delivering ? 'local_shipping' : 'local_laundry_service'
        };
      default:
        return {
          label: 'Pendiente',
          labelClass: 'text-slate-400',
          iconContainerClass: 'bg-slate-100 dark:bg-slate-700',
          iconClass: 'text-slate-500 dark:text-slate-400',
          dotClass: 'bg-slate-300 dark:bg-slate-600',
          cardClass: 'border border-slate-100 dark:border-slate-800',
          icon: 'schedule'
        };
    }
  }

  private async initializeMap(): Promise<void> {
    if (this.map || !this.routeMapContainer) {
      return;
    }

    const L = await this.loadLeaflet();

    this.map = L.map(this.routeMapContainer.nativeElement, {
      zoomControl: false,
      attributionControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    this.mapMarkersLayer = L.layerGroup().addTo(this.map);
    await this.renderRouteOnMap();
  }

  private parseCoordinate(value: number | string | null): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const normalizedValue = value.trim();
      if (normalizedValue.length === 0) {
        return null;
      }

      const parsedValue = Number(normalizedValue);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    return null;
  }

  private hasCoordinates(
    tarea: TareaRuta
  ): tarea is TareaRuta & { latitude: number; longitude: number } {
    return (
      typeof tarea.latitude === 'number' &&
      Number.isFinite(tarea.latitude) &&
      typeof tarea.longitude === 'number' &&
      Number.isFinite(tarea.longitude)
    );
  }

  private async renderRouteOnMap(): Promise<void> {
    if (!this.map || !this.mapMarkersLayer) {
      return;
    }

    const L = await this.loadLeaflet();
    const mapMarkersLayer = this.mapMarkersLayer;

    mapMarkersLayer.clearLayers();

    const tasksWithCoordinates = this.tareas().filter((tarea) => this.hasCoordinates(tarea));
    if (tasksWithCoordinates.length === 0) {
      this.map.setView([20.6736, -103.344], 11);
      this.map.invalidateSize();
      return;
    }
    const [firstTask, ...remainingTasks] = tasksWithCoordinates;
    const bounds = L.latLngBounds([firstTask.latitude, firstTask.longitude], [
      firstTask.latitude,
      firstTask.longitude
    ]);

    remainingTasks.forEach((tarea) => {
      bounds.extend([tarea.latitude, tarea.longitude]);
    });

    tasksWithCoordinates.forEach((tarea) => {
      const marker = L.circleMarker([tarea.latitude, tarea.longitude], {
        radius: tarea.highlighted ? 10 : 8,
        color: tarea.highlighted ? '#eab308' : '#0f172a',
        weight: 2,
        fillColor: tarea.highlighted ? '#facc15' : '#2563eb',
        fillOpacity: 0.9
      });

      marker.bindPopup(
        `<div style="min-width: 180px;">
          <strong>Orden #${tarea.displayId}</strong><br>
          <span>${tarea.tipo}</span><br>
          <span>${tarea.direccion}</span><br>
          <span>${tarea.hora}</span>
        </div>`
      );

      marker.addTo(mapMarkersLayer);
    });

    if (tasksWithCoordinates.length === 1) {
      const [tarea] = tasksWithCoordinates;
      this.map.setView([tarea.latitude, tarea.longitude], 15);
    } else {
      this.map.fitBounds(bounds, {
        padding: [24, 24]
      });
    }

    this.map.invalidateSize();
  }

  private async loadLeaflet(): Promise<LeafletModule> {
    if (!this.leaflet) {
      const leafletImport = (await import('leaflet')) as LeafletImport;
      this.leaflet = leafletImport.default ?? leafletImport;
    }

    return this.leaflet;
  }
}
