import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { HomeComponent } from './components/home/home.component';
import { SiteComponent } from './components/site/site.component';
import { SettingsComponent } from './components/settings/settings.component';
import { NotificationsComponent } from './components/notifications/notifications.component';
import { AddRuleComponent } from './components/add-rule/add-rule.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'home', component: HomeComponent, canActivate: [authGuard] },
  { path: 'site/:id', component: SiteComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
  { path: 'notifications', component: NotificationsComponent, canActivate: [authGuard] },
  { path: 'add-rule', component: AddRuleComponent, canActivate: [authGuard] },
];
