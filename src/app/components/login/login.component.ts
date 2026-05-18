import { Component, OnInit, OnDestroy, NO_ERRORS_SCHEMA } from '@angular/core';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { RouterExtensions } from '@nativescript/angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  schemas: [NO_ERRORS_SCHEMA],
})
export class LoginComponent implements OnInit, OnDestroy {
  private authSub?: Subscription;

  constructor(
    private authService: AuthService,
    private router: RouterExtensions
  ) {}

  ngOnInit(): void {
    if (this.authService.isAuthenticated) {
      this.router.navigate(['/home'], { clearHistory: true });
      return;
    }
    this.authSub = this.authService.isAuthenticated$.pipe(
      filter(v => v)
    ).subscribe(() => {
      this.router.navigate(['/home'], { clearHistory: true });
    });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
  }

  login(): void {
    this.authService.login();
  }
}
