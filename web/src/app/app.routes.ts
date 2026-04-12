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
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  { path: '**', redirectTo: '' },
];
