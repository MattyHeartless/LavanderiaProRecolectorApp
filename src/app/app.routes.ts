import { Routes } from '@angular/router';
import { authChildGuard, authGuard, guestGuard } from './app/core/auth/auth.guards';
import { MainLayoutComponent } from './app/layout/main-layout/main-layout.component';
import { DashboardComponent } from './app/pages/dashboard/dashboard.component';
import { DetallePedidoComponent } from './app/pages/detalle-pedido/detalle-pedido.component';
import { EvidenciaCamaraComponent } from './app/pages/evidencia-camara/evidencia-camara.component';
import { LoginComponent } from './app/pages/login/login.component';
import { MiRutaComponent } from './app/pages/mi-ruta/mi-ruta.component';
import { PedidosComponent } from './app/pages/pedidos/pedidos.component';
import { PerfilComponent } from './app/pages/perfil/perfil.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestGuard]
  },
  {
    path: 'app/ruta/detalle/:id',
    component: DetallePedidoComponent,
    canActivate: [authGuard]
  },
  {
    path: 'app/ruta/detalle/:id/evidencia',
    component: EvidenciaCamaraComponent,
    canActivate: [authGuard]
  },
  {
    path: 'app',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    canActivateChild: [authChildGuard],
    children: [
      {
        path: 'dashboard',
        component: DashboardComponent
      },
      {
        path: 'pedidos',
        component: PedidosComponent
      },
      {
        path: 'ruta',
        component: MiRutaComponent
      },
      {
        path: 'perfil',
        component: PerfilComponent
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      }
    ]
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login'
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];
