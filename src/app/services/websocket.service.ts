import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

declare const okhttp3: any;
declare const java: any;

export interface PlcTag {
  name: string;
  dataType: string;
  value: any;
  displayName: string;
  unit: string;
  error: boolean;
  errorMessage: string | null;
}

export interface PlcSnapshot {
  tenant_id: number;
  site_id: number;
  timestamp: string;
  tags: PlcTag[];
}

export interface SiteStatusUpdate {
  site_id: number;
  connection_status: boolean;
  last_seen?: string;
}

// Implements socket.io v4 protocol using OkHttp WebSocket (Android native).
// NativeScript does not expose a browser-style WebSocket global, but OkHttp
// is bundled with every Android app and accessible via Java interop.
@Injectable({
  providedIn: 'root'
})
export class WebSocketService implements OnDestroy {
  private ws: any = null; // okhttp3.WebSocket
  private connecting = false;
  private nsConnected = false;
  private reconnectTimer: any = null;
  private pendingEmits: [string, any][] = [];
  private activeSubscriptions = new Set<string>(); // "tenantId:siteId"

  private readonly NAMESPACE = '/api/data/web';

  private siteStatusSubject = new Subject<SiteStatusUpdate>();
  private plcSnapshotSubject = new Subject<PlcSnapshot>();
  private plcTagsSubject = new Subject<PlcSnapshot>();

  siteStatus$: Observable<SiteStatusUpdate> = this.siteStatusSubject.asObservable();
  plcSnapshot$: Observable<PlcSnapshot> = this.plcSnapshotSubject.asObservable();
  plcTags$: Observable<PlcSnapshot> = this.plcTagsSubject.asObservable();

  // Latest snapshot per site_id — used by the add-rule screen to enumerate available tags
  readonly latestSnapshots = new Map<number, PlcSnapshot>();

  constructor(private ngZone: NgZone) {}

  connect(): void {
    if (this.ws !== null || this.connecting) return;
    this.connecting = true;

    const base = environment.WS_SERVER.replace(/\/$/, '');
    const wsUrl = base.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    const url = `${wsUrl}/socket.io/?EIO=4&transport=websocket`;

    this.ngZone.runOutsideAngular(() => {
      try {
        const client = new okhttp3.OkHttpClient.Builder()
          .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
          .readTimeout(0, java.util.concurrent.TimeUnit.MILLISECONDS)
          .build();

        const request = new okhttp3.Request.Builder()
          .url(url)
          .build();

        const self = this;

        const ListenerClass = (okhttp3 as any).WebSocketListener.extend({
          onOpen(ws: any, _response: any): void {
            self.ws = ws;
            self.connecting = false;
          },
          onMessage(_ws: any, text: any): void {
            self.handleMessage(text.toString());
          },
          onFailure(_ws: any, t: any, _response: any): void {
            console.error('OkHttp WebSocket failure:', t?.getMessage ? t.getMessage() : String(t));
            self.ws = null;
            self.connecting = false;
            self.nsConnected = false;
            self.scheduleReconnect();
          },
          onClosed(_ws: any, _code: number, _reason: string): void {
            self.ws = null;
            self.connecting = false;
            self.nsConnected = false;
            self.scheduleReconnect();
          }
        });

        client.newWebSocket(request, new ListenerClass());
      } catch (e) {
        console.error('Failed to create WebSocket:', e);
      }
    });
  }

  subscribeSite(tenantId: number, siteId: number): void {
    const key = `${tenantId}:${siteId}`;
    this.activeSubscriptions.add(key);
    if (this.nsConnected) {
      this.rawSend(`42${this.NAMESPACE},${JSON.stringify(['subscribe_site', { tenant_id: tenantId, site_id: siteId }])}`);
    }
    // else: replayed via activeSubscriptions loop on namespace join
  }

  unsubscribeSite(tenantId: number, siteId: number): void {
    const key = `${tenantId}:${siteId}`;
    this.activeSubscriptions.delete(key);
    if (this.nsConnected) {
      this.rawSend(`42${this.NAMESPACE},${JSON.stringify(['unsubscribe_site', { tenant_id: tenantId, site_id: siteId }])}`);
    }
  }

  emit(event: string, data: any): void {
    if (!this.nsConnected) {
      this.pendingEmits.push([event, data]);
      return;
    }
    this.rawSend(`42${this.NAMESPACE},${JSON.stringify([event, data])}`);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(1000, 'disconnect'); } catch {}
      this.ws = null;
    }
    this.connecting = false;
    this.nsConnected = false;
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.siteStatusSubject.complete();
    this.plcSnapshotSubject.complete();
    this.plcTagsSubject.complete();
  }

  private handleMessage(raw: string): void {
    if (!raw || raw.length === 0) return;

    const eioType = raw[0];

    // Engine.io OPEN: 0{...json...}
    // In EIO v4, the server initiates pings — client only responds with pong.
    if (eioType === '0') {
      this.rawSend(`40${this.NAMESPACE},`);
      return;
    }

    // Engine.io PING: 2
    if (eioType === '2') {
      this.rawSend('3');
      return;
    }

    // Engine.io MESSAGE: 4...
    if (eioType !== '4') return;

    const sioType = raw[1];

    // Socket.io CONNECT: 40 or 40/ns,...
    if (sioType === '0') {
      if (raw.includes(this.NAMESPACE)) {
        this.nsConnected = true;
        // Re-subscribe to active sites
        for (const key of this.activeSubscriptions) {
          const [tid, sid] = key.split(':');
          this.rawSend(`42${this.NAMESPACE},${JSON.stringify(['subscribe_site', { tenant_id: Number(tid), site_id: Number(sid) }])}`);
        }
        // Flush pending emits
        const pending = [...this.pendingEmits];
        this.pendingEmits = [];
        for (const [event, data] of pending) {
          this.emit(event, data);
        }
      }
      return;
    }

    // Socket.io EVENT: 42/ns,["event", data]
    if (sioType === '2') {
      const nsPrefix = `42${this.NAMESPACE},`;
      if (!raw.startsWith(nsPrefix)) return;
      try {
        const [eventName, eventData] = JSON.parse(raw.substring(nsPrefix.length));
        this.ngZone.run(() => this.dispatchEvent(eventName, eventData));
      } catch (e) {
        console.error('Failed to parse socket.io event:', e);
      }
    }
  }

  private dispatchEvent(event: string, data: any): void {
    switch (event) {
      case 'plc:snapshot': {
        const snap = data as PlcSnapshot;
        this.latestSnapshots.set(snap.site_id, snap);
        this.plcSnapshotSubject.next(snap);
        break;
      }
      case 'plc:tags':
        this.plcTagsSubject.next(data as PlcSnapshot);
        break;
      case 'site_status_update':
        this.siteStatusSubject.next(data as SiteStatusUpdate);
        break;
    }
  }

  private rawSend(data: string): void {
    if (this.ws !== null) {
      try {
        this.ws.send(data);
      } catch (e) {
        console.error('WebSocket send failed:', e);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}
