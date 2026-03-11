import { NgClass } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthService, CourierSession } from '../../core/auth/auth.service';
import {
  CourierCompletedOrdersByDay,
  CourierKpis,
  CourierRecentCompletedOrder,
  OrdersService
} from '../../core/orders/orders.service';

interface ChartBar {
  count: number;
  date: string;
  dayLabel: string;
  height: number;
  isHighlighted: boolean;
}

interface RecentActivityItem {
  completedAtLabel: string;
  feeLabel: string;
  orderDisplayId: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [NgClass],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);
  private readonly catalogsApiBase = 'http://localhost:5009';
  private readonly defaultProfileImageUrl =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDdZ_OJJXxgWIKTiP9TUUFrIBYxtREwJS6vt8KvAKfjhIvyU5d-kLOS9p5WEGdN-qxuiRK8OI91SC55n27EJH_FPRUVjeA6Q1hvy3fZaopRFyvxWGyisTE_yMTv2bXxdNbMqfbiaeraKzkc4Ucb9mGP898bDlBLXvPBrGhMbfh6B6UN07LNPeECL6yuMDQHjqGL9cfjxMaWY-aSa42hNoVlmD7Ubpx39pPEHQtgC48_AjITVe2u6_EMQhBX4aOuLVZP9SDJpBlI010';
  private readonly shortDayFormatter = new Intl.DateTimeFormat('es-MX', {
    weekday: 'short'
  });
  private readonly recentCompletedAtFormatter = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  readonly courierName = signal('Recolector');
  readonly profileImageUrl = signal(this.defaultProfileImageUrl);
  readonly isLoadingKpis = signal(false);
  readonly dashboardErrorMessage = signal<string | null>(null);
  readonly courierKpis = signal<CourierKpis | null>(null);
  readonly chartBars = computed(() => this.buildChartBars(this.courierKpis()?.completedOrdersByDay ?? []));
  readonly recentActivity = computed(() =>
    (this.courierKpis()?.recentCompletedOrders ?? []).map((order) => this.mapRecentActivityItem(order))
  );

  ngOnInit(): void {
    this.loadCourierInfo();
  }

  get completedOrdersCount(): number {
    return this.courierKpis()?.completedOrdersCount ?? 0;
  }

  get totalEarned(): number {
    return this.courierKpis()?.totalEarned ?? 0;
  }

  get totalEarnedLabel(): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(this.totalEarned);
  }

  get totalCompletedInChart(): number {
    return this.chartBars().reduce((total, bar) => total + bar.count, 0);
  }

  private loadCourierInfo(): void {
    const session = this.authService.getSession();
    if (!session) {
      return;
    }

    this.applyCourierSession(session);
    this.loadCourierKpis(session.courier.id);

    this.authService.getCourierByAuthUserId(session.authUser.id).subscribe({
      next: (response) => {
        const updatedSession: CourierSession = {
          ...session,
          courier: response.courier
        };

        this.persistSession(updatedSession);
        this.applyCourierSession(updatedSession);
      }
    });
  }

  private loadCourierKpis(courierGuid: string): void {
    this.isLoadingKpis.set(true);
    this.dashboardErrorMessage.set(null);

    this.ordersService
      .getCourierKpis(courierGuid)
      .pipe(finalize(() => this.isLoadingKpis.set(false)))
      .subscribe({
        next: (kpis) => this.courierKpis.set(kpis),
        error: (error: Error) => {
          this.courierKpis.set(null);
          this.dashboardErrorMessage.set(error.message);
        }
      });
  }

  private applyCourierSession(session: CourierSession): void {
    const name = session.courier.name;
    if (typeof name === 'string' && name.trim().length > 0) {
      this.courierName.set(name.trim());
    } else {
      this.courierName.set('Recolector');
    }

    const imageUrl = session.courier.profileImageUrl;
    if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
      this.profileImageUrl.set(this.resolveImageUrl(imageUrl));
    } else {
      this.profileImageUrl.set(this.defaultProfileImageUrl);
    }
  }

  private buildChartBars(days: CourierCompletedOrdersByDay[]): ChartBar[] {
    if (days.length === 0) {
      return [];
    }

    const maxCount = Math.max(...days.map((day) => day.count), 1);

    return days.map((day, index) => {
      const parsedDate = new Date(`${day.date}T00:00:00`);
      const dayLabel = Number.isNaN(parsedDate.getTime())
        ? day.date
        : this.shortDayFormatter
            .format(parsedDate)
            .replace('.', '')
            .slice(0, 3);

      return {
        date: day.date,
        count: day.count,
        dayLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
        height: Math.max(18, Math.round((day.count / maxCount) * 100)),
        isHighlighted: index === days.length - 1
      };
    });
  }

  private mapRecentActivityItem(order: CourierRecentCompletedOrder): RecentActivityItem {
    return {
      orderDisplayId: order.orderId.split('-')[0].toUpperCase(),
      feeLabel: `+${new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN'
      }).format(order.deliveryFee)}`,
      completedAtLabel: this.formatRecentCompletedAt(order.completedAt)
    };
  }

  private formatRecentCompletedAt(value: string): string {
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    return this.recentCompletedAtFormatter.format(parsedDate);
  }

  private resolveImageUrl(urlOrPath: string): string {
    const trimmedValue = urlOrPath.trim();
    if (/^https?:\/\//i.test(trimmedValue)) {
      return trimmedValue;
    }

    if (trimmedValue.startsWith('/')) {
      return `${this.catalogsApiBase}${trimmedValue}`;
    }

    return `${this.catalogsApiBase}/${trimmedValue}`;
  }

  private persistSession(session: CourierSession): void {
    this.authService.persistSession(session);
  }
}
