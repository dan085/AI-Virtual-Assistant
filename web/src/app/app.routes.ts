import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'agents',
    loadComponent: () =>
      import('./features/agents/agents.component').then((m) => m.AgentsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'chat',
    loadComponent: () =>
      import('./features/chat/chat.component').then((m) => m.ChatComponent),
    canActivate: [authGuard],
  },
  {
    path: 'chat/:conversationId',
    loadComponent: () =>
      import('./features/chat/chat.component').then((m) => m.ChatComponent),
    canActivate: [authGuard],
  },
  {
    path: 'instagram',
    loadComponent: () =>
      import('./features/instagram/instagram.component').then(
        (m) => m.InstagramComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'connections',
    loadComponent: () =>
      import('./features/connections/connections.component').then(
        (m) => m.ConnectionsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'tickets',
    loadComponent: () =>
      import('./features/tickets/tickets.component').then((m) => m.TicketsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'videos',
    loadComponent: () =>
      import('./features/videos/videos.component').then((m) => m.VideosComponent),
    canActivate: [authGuard],
  },
  {
    path: 'media',
    loadComponent: () =>
      import('./features/media-library/media-library.component').then(
        (m) => m.MediaLibraryComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'scheduler',
    loadComponent: () =>
      import('./features/scheduler/scheduler.component').then(
        (m) => m.SchedulerComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'admin/agents',
    loadComponent: () =>
      import('./features/admin/admin-agents.component').then(
        (m) => m.AdminAgentsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  { path: '**', redirectTo: '' },
];
