import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterExtensions, NativeScriptCommonModule } from '@nativescript/angular';
import { AuthService, Auth0UserProfile } from '../../services/auth.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class SettingsComponent {
  userProfile: Auth0UserProfile | null;

  constructor(
    private authService: AuthService,
    private router: RouterExtensions
  ) {
    this.userProfile = this.authService.getUserProfile();
  }

  get userInitials(): string {
    const p = this.userProfile;
    if (!p) return '?';
    const first = p.given_name?.charAt(0) ?? p.name?.charAt(0) ?? '';
    const last = p.family_name?.charAt(0) ?? '';
    return (first + last).toUpperCase() || '?';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login'], { clearHistory: true });
  }
}
