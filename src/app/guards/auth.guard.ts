import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { RouterExtensions } from '@nativescript/angular';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(RouterExtensions);

  return authService.isAuthenticated$.pipe(
    take(1),
    map(isAuthenticated => {
      if (!isAuthenticated) {
        router.navigate(['/login'], { clearHistory: true });
        return false;
      }
      return true;
    })
  );
};
