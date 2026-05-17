import { Component, OnInit, OnDestroy, NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RouterExtensions, NativeScriptCommonModule } from '@nativescript/angular';
import { Subscription, interval } from 'rxjs';
import { filter } from 'rxjs/operators';
import { Site, SiteService, SiteUptime } from '../../services/site.service';
import { WebSocketService, PlcTag, PlcSnapshot } from '../../services/websocket.service';

@Component({
  selector: 'app-site',
  templateUrl: './site.component.html',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class SiteComponent implements OnInit, OnDestroy {
  siteId: number | null = null;
  siteData: Site | null = null;
  loading = true;
  connectedAt: Date | null = null;
  uptime = '--';
  uptimeData: SiteUptime | null = null;
  tags: PlcTag[] = [];
  lastTimestamp: string | null = null;

  private wsSnapshotSub?: Subscription;
  private wsStatusSub?: Subscription;
  private uptimeInterval?: Subscription;

  get activeTags(): PlcTag[] {
    return this.tags.filter(t => !t.error);
  }

  get statusColor(): string {
    if (this.siteData?.connection_status === 'online') return '#30D158';
    if (this.siteData?.connection_status === 'warning') return '#FF9F0A';
    return '#FF453A';
  }

  get uptimePercent(): string {
    if (!this.uptimeData) return '--';
    return this.uptimeData.uptime_percentage.toFixed(1) + '%';
  }

  constructor(
    private route: ActivatedRoute,
    private router: RouterExtensions,
    private webSocketService: WebSocketService,
    private siteService: SiteService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.siteId = +params['id'];
    });

    this.route.queryParams.subscribe(params => {
      if (params['name'] && this.siteId) {
        this.siteData = {
          site_id: this.siteId,
          name: params['name'],
          connection_status: (params['status'] as any) || 'offline',
        };
        this.loading = false;
      } else if (this.siteId) {
        this.siteService.getSiteById(this.siteId).subscribe({
          next: (site) => { this.siteData = site; this.loading = false; },
          error: () => {
            this.siteData = { site_id: this.siteId!, name: `Site ${this.siteId}`, connection_status: 'offline' };
            this.loading = false;
          }
        });
      }

      this.subscribeToLiveData();
      this.loadUptimeData();
    });
  }

  ngOnDestroy(): void {
    this.wsSnapshotSub?.unsubscribe();
    this.wsStatusSub?.unsubscribe();
    this.uptimeInterval?.unsubscribe();
  }

  goBack(): void {
    this.router.back();
  }

  tagValue(tag: PlcTag): string {
    if (tag.value == null) return '--';
    const num = Number(tag.value);
    if (!isNaN(num) && tag.dataType === 'REAL') {
      const formatted = num.toFixed(2).replace(/\.?0+$/, '');
      return tag.unit ? `${formatted} ${tag.unit}` : formatted;
    }
    return tag.unit ? `${tag.value} ${tag.unit}` : String(tag.value);
  }

  private subscribeToLiveData(): void {
    this.wsSnapshotSub = this.webSocketService.plcSnapshot$.pipe(
      filter(s => s.site_id === this.siteId)
    ).subscribe(snapshot => {
      this.tags = snapshot.tags;
      this.lastTimestamp = snapshot.timestamp;
    });

    this.wsStatusSub = this.webSocketService.siteStatus$.pipe(
      filter(u => u.site_id === this.siteId)
    ).subscribe(update => {
      if (!this.siteData) return;
      const newStatus = update.connection_status ? 'online' : 'offline';
      const wasOnline = this.siteData.connection_status === 'online';
      this.siteData = { ...this.siteData, connection_status: newStatus };
      if (wasOnline !== (newStatus === 'online')) {
        this.uptimeInterval?.unsubscribe();
        this.uptimeInterval = undefined;
        this.loadUptimeData();
      }
    });
  }

  private loadUptimeData(): void {
    if (!this.siteId) return;
    this.siteService.getSiteUptime(1001, this.siteId, 30).subscribe({
      next: (data) => { this.uptimeData = data; this.processCurrentSession(); },
      error: (err) => console.error('Failed to load uptime data:', err)
    });
  }

  private processCurrentSession(): void {
    this.uptimeInterval?.unsubscribe();
    this.uptimeInterval = undefined;

    if (!this.uptimeData?.sessions?.length) {
      this.connectedAt = null;
      this.uptime = '--';
      return;
    }

    const activeSession = this.uptimeData.sessions.find(s => s.disconnected_at === null);
    if (activeSession) {
      this.connectedAt = new Date(activeSession.connected_at);
      this.updateUptime();
      this.uptimeInterval = interval(1000).subscribe(() => this.updateUptime());
    } else {
      const lastSession = this.uptimeData.sessions[this.uptimeData.sessions.length - 1];
      this.connectedAt = new Date(lastSession.connected_at);
      this.uptime = lastSession.duration_ms !== null ? this.formatDuration(lastSession.duration_ms) : '--';
    }
  }

  private updateUptime(): void {
    if (!this.connectedAt) { this.uptime = '--'; return; }
    this.uptime = this.formatDuration(Date.now() - this.connectedAt.getTime());
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
  }
}
