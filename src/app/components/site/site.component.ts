import { Component, OnInit, OnDestroy, NO_ERRORS_SCHEMA } from '@angular/core';
import { Screen } from '@nativescript/core';
import { ActivatedRoute } from '@angular/router';
import { RouterExtensions, NativeScriptCommonModule } from '@nativescript/angular';
import { Subscription, interval } from 'rxjs';
import { filter } from 'rxjs/operators';
import { Site, SiteService, SiteUptime, PlcSnapshot } from '../../services/site.service';
import { WebSocketService, PlcTag } from '../../services/websocket.service';
import { LineDataSet, Mode } from '@nativescript-community/ui-chart/data/LineDataSet';
import { LineData } from '@nativescript-community/ui-chart/data/LineData';
import { XAxisPosition } from '@nativescript-community/ui-chart/components/XAxis';

const HISTORY_SECONDS = 3600; // 1 hour of history
const VISIBLE_SECONDS = 300;  // 5 minutes default visible window

interface HistoryPoint { x: number; y: number; }

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

  // Chart state
  selectedTagName: string | null = null;
  private tagHistory = new Map<string, HistoryPoint[]>();
  private startTime: number | null = null;
  private chartWidget: any = null;
  private lastPanDeltaX = 0;
  private followingLatest = true;

  private wsSnapshotSub?: Subscription;
  private wsStatusSub?: Subscription;
  private uptimeInterval?: Subscription;

  get activeTags(): PlcTag[] {
    return this.tags.filter(t => !t.error);
  }

  get chartableTags(): PlcTag[] {
    return this.activeTags.filter(t => !isNaN(Number(t.value)));
  }

  get selectedTag(): PlcTag | null {
    return this.chartableTags.find(t => t.name === this.selectedTagName) ?? null;
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
      this.loadHistoricalData();
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

  // ── Chart ──────────────────────────────────────────────────────────────────

  selectTag(tagName: string): void {
    if (this.selectedTagName === tagName) return;
    this.selectedTagName = tagName;
    this.rebuildChartData();
  }

  scrollToLatest(): void {
    if (!this.chartWidget || !this.selectedTagName) return;
    const history = this.tagHistory.get(this.selectedTagName);
    if (history && history.length > 0) {
      this.followingLatest = true;
      this.chartWidget.moveViewToX(history[history.length - 1].x);
    }
  }

  onChartLoaded(widget: any): void {
    this.chartWidget = widget;
    this.configureChart(widget);
    if (this.selectedTagName) {
      this.rebuildChartData();
    }
  }

  onChartPan(args: any): void {
    if (!this.chartWidget) return;

    // state 1 = began, 2 = changed, 3 = ended/cancelled
    if (args.state === 1) {
      this.lastPanDeltaX = 0;
      return;
    }
    if (args.state !== 2) return;

    const step = args.deltaX - this.lastPanDeltaX;
    this.lastPanDeltaX = args.deltaX;

    const chartWidth: number = (this.chartWidget.getMeasuredWidth?.() || 320) / Screen.mainScreen.scale;
    const secondsPerPixel = VISIBLE_SECONDS / chartWidth;
    const currentLeft: number = this.chartWidget.lowestVisibleX ?? 0;
    const newLeft = currentLeft - step * secondsPerPixel;
    this.chartWidget.moveViewToX(newLeft);

    // Determine whether the user is viewing the live edge
    const history = this.selectedTagName ? this.tagHistory.get(this.selectedTagName) : null;
    const latestX = history?.length ? history[history.length - 1].x : 0;
    const highestVisible: number = this.chartWidget.highestVisibleX ?? 0;
    this.followingLatest = highestVisible >= latestX - VISIBLE_SECONDS * 0.1;
  }

  private configureChart(chart: any): void {
    chart.touchEnabled = false;
    chart.dragXEnabled = false;
    chart.dragYEnabled = false;
    chart.pinchZoomEnabled = false;
    chart.doubleTapToZoomEnabled = false;
    chart.highlightPerTapEnabled = false;
    chart.highlightPerDragEnabled = false;
    chart.backgroundColor = '#1C1C1E';

    // Hide built-in description
    if (chart.chartDescription) {
      chart.chartDescription.enabled = false;
    }

    // Hide legend
    if (chart.legend) {
      chart.legend.enabled = false;
    }

    // X axis
    const xAxis = chart.xAxis;
    if (xAxis) {
      xAxis.position = XAxisPosition.BOTTOM;
      xAxis.textColor = '#8E8E93';
      xAxis.gridColor = '#38383A';
      xAxis.granularity = 60;    // label every 60s minimum
      xAxis.labelCount = 5;
      xAxis.valueFormatter = {
        getAxisLabel: (value: number, _axis: any) => {
          if (!this.startTime) return '';
          const d = new Date(this.startTime + value * 1000);
          const h = d.getHours().toString().padStart(2, '0');
          const m = d.getMinutes().toString().padStart(2, '0');
          return `${h}:${m}`;
        }
      };
    }

    // Left Y axis
    const leftAxis = chart.axisLeft;
    if (leftAxis) {
      leftAxis.textColor = '#8E8E93';
      leftAxis.gridColor = '#38383A';
    }

    // Disable right Y axis
    const rightAxis = chart.axisRight;
    if (rightAxis) {
      rightAxis.enabled = false;
    }
  }

  private rebuildChartData(): void {
    if (!this.chartWidget || !this.selectedTagName) return;
    const history = this.tagHistory.get(this.selectedTagName) ?? [];

    const dataset = new LineDataSet(history.slice(), this.selectedTagName, 'x', 'y');
    this.styleDataSet(dataset);

    const lineData = new LineData([dataset]);
    this.chartWidget.data = lineData;
    this.chartWidget.visibleXRangeMaximum = VISIBLE_SECONDS;
    this.chartWidget.notifyDataSetChanged();

    if (history.length > 0 && this.followingLatest) {
      this.chartWidget.moveViewToX(history[history.length - 1].x);
    }
    this.chartWidget.invalidate();
  }

  private styleDataSet(dataset: any): void {
    dataset.color = '#0A84FF';
    dataset.lineWidth = 2;
    dataset.drawCirclesEnabled = false;
    dataset.drawValuesEnabled = false;
    dataset.mode = Mode.LINEAR;
    dataset.drawFilledEnabled = false;
  }

  // ── Data / history ─────────────────────────────────────────────────────────

  private addToHistory(snapshot: PlcSnapshot): void {
    const now = Date.now();
    if (!this.startTime) this.startTime = now;
    const x = (now - this.startTime) / 1000;
    const cutoff = x - HISTORY_SECONDS;

    for (const tag of snapshot.tags) {
      if (tag.error) continue;
      const y = Number(tag.value);
      if (isNaN(y)) continue;

      let history = this.tagHistory.get(tag.name);
      if (!history) {
        history = [];
        this.tagHistory.set(tag.name, history);
      }
      history.push({ x, y });
      // Trim points older than 1 hour
      while (history.length > 0 && history[0].x < cutoff) {
        history.shift();
      }
    }

    // Auto-select first chartable tag
    if (!this.selectedTagName && this.chartableTags.length > 0) {
      this.selectedTagName = this.chartableTags[0].name;
    }

    if (this.selectedTagName && this.chartWidget) {
      this.rebuildChartData();
    }
  }

  // ── Existing subscription / uptime logic ───────────────────────────────────

  private subscribeToLiveData(): void {
    this.wsSnapshotSub = this.webSocketService.plcSnapshot$.pipe(
      filter(s => s.site_id === this.siteId)
    ).subscribe(snapshot => {
      this.tags = snapshot.tags;
      this.lastTimestamp = snapshot.timestamp;
      this.addToHistory(snapshot);
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

  private loadHistoricalData(): void {
    if (!this.siteId) return;
    this.siteService.getSiteSnapshots(1001, this.siteId).subscribe({
      next: (snapshots) => {
        if (!snapshots.length) return;

        // Anchor x-axis to the earliest historical snapshot.
        // Override any startTime already set by live data that arrived while loading —
        // those entries used the wrong origin and will be cleared below.
        this.startTime = new Date(snapshots[0].timestamp).getTime();

        // Discard live entries that were recorded with the wrong startTime
        this.tagHistory.clear();

        for (const snapshot of snapshots) {
          const x = (new Date(snapshot.timestamp).getTime() - this.startTime) / 1000;
          for (const tag of snapshot.tags) {
            if (tag.error) continue;
            const y = Number(tag.value);
            if (isNaN(y)) continue;
            let history = this.tagHistory.get(tag.name);
            if (!history) {
              history = [];
              this.tagHistory.set(tag.name, history);
            }
            history.push({ x, y });
          }
        }

        // Auto-select first tag from history if none selected yet
        if (!this.selectedTagName && this.tagHistory.size > 0) {
          this.selectedTagName = this.tagHistory.keys().next().value ?? null;
        }

        // Rebuild chart if widget is already loaded
        if (this.chartWidget) {
          this.rebuildChartData();
        }
      },
      error: (err) => console.error('Failed to load historical snapshots:', err)
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
