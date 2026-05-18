import { Component, OnInit, OnDestroy, NO_ERRORS_SCHEMA } from '@angular/core';
import { Subscription } from 'rxjs';
import { RouterExtensions, NativeScriptCommonModule } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { Site } from '../../services/site.service';
import { TenantService, Tenant, TenantSite } from '../../services/tenant.service';
import { WebSocketService, PlcSnapshot } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { SiteCardComponent } from '../site-card/site-card.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  imports: [NativeScriptCommonModule, SiteCardComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class HomeComponent implements OnInit, OnDestroy {
  loading = true;
  tenant: Tenant | undefined;
  sites: Site[] = [];
  snapshots: { [site_id: number]: PlcSnapshot } = {};

  private wsStatusSub?: Subscription;
  private wsSnapshotSub?: Subscription;

  get sortedSites(): Site[] {
    return [...this.sites].sort((a, b) => a.name.localeCompare(b.name));
  }

  constructor(
    private tenantService: TenantService,
    private webSocketService: WebSocketService,
    private authService: AuthService,
    private notificationService: NotificationService,
    private router: RouterExtensions
  ) {}

  ngOnInit(): void {
    this.notificationService.initFcm();

    this.tenantService.getTenantById(1001).subscribe({
      next: (t) => {
        this.tenant = t;
        this.sites = t.sites.map((s: TenantSite) => ({
          site_id: s.site_id,
          name: s.name,
          connection_status: s.connection_status === true ? 'online' : 'offline',
          app_version: s.app_version,
        }));
        this.loading = false;

        this.webSocketService.connect();

        for (const site of this.sites) {
          this.webSocketService.subscribeSite(t.tenant_id, site.site_id);
        }
      },
      error: (err) => {
        console.error('Error loading tenant:', err);
        this.loading = false;
      }
    });

    this.wsStatusSub = this.webSocketService.siteStatus$.subscribe(update => {
      this.sites = this.sites.map(site =>
        site.site_id === update.site_id
          ? { ...site, connection_status: update.connection_status ? 'online' : 'offline' }
          : site
      );
    });

    this.wsSnapshotSub = this.webSocketService.plcSnapshot$.subscribe(snapshot => {
      this.snapshots = { ...this.snapshots, [snapshot.site_id]: snapshot };
    });
  }

  ngOnDestroy(): void {
    this.wsStatusSub?.unsubscribe();
    this.wsSnapshotSub?.unsubscribe();
    if (this.tenant) {
      for (const site of this.sites) {
        this.webSocketService.unsubscribeSite(this.tenant.tenant_id, site.site_id);
      }
    }
  }

  navigateToSite(site: Site): void {
    this.router.navigate(['/site', site.site_id], {
      queryParams: { name: site.name, status: site.connection_status }
    });
  }

  showMenu(): void {
    const authLabel = this.authService.isAuthenticated ? 'Logout' : 'Login';
    Dialogs.action({ cancelButtonText: 'Cancel', actions: ['Settings', authLabel] }).then(result => {
      if (result === 'Settings') {
        this.router.navigate(['/settings']);
      } else if (result === 'Logout') {
        this.authService.logout();
        this.router.navigate(['/login'], { clearHistory: true });
      } else if (result === 'Login') {
        this.router.navigate(['/login'], { clearHistory: true });
      }
    });
  }
}
