import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map } from 'rxjs';
import { RouterExtensions } from '@nativescript/angular';
import { Application } from '@nativescript/core';
import { environment } from '../../environments/environment';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  data?: any;
  created_at: string;
  read_at: string | null;
  read: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  notifications$ = this.notificationsSubject.asObservable();
  unreadCount$ = this.notifications$.pipe(map(ns => ns.filter(n => !n.read).length));

  private fcmInitialized = false;

  constructor(private http: HttpClient, private router: RouterExtensions) {}

  async initFcm(): Promise<void> {
    if (this.fcmInitialized) return;
    this.fcmInitialized = true;
    try {
      console.log('[FCM] Starting init...');

      const { firebase } = await import('@nativescript/firebase-core');
      console.log('[FCM] firebase-core imported');

      const { Messaging } = await import('@nativescript/firebase-messaging');
      console.log('[FCM] firebase-messaging imported');

      const messaging = firebase().messaging();
      messaging.showNotificationsWhenInForeground = true;

      await messaging.registerDeviceForRemoteMessages();
      console.log('[FCM] registerDeviceForRemoteMessages OK');

      const permResult = await messaging.requestPermission();
      console.log('[FCM] requestPermission result:', permResult);

      // Android 8+ requires a notification channel or notifications are silently dropped
      this.createNotificationChannel();

      const token = await messaging.getToken();
      console.log('[FCM] token:', token ? token.substring(0, 20) + '...' : 'NULL');
      if (token) this.sendTokenToServer(token);

      messaging.onToken((newToken: string) => {
        console.log('[FCM] token refreshed');
        this.sendTokenToServer(newToken);
      });

      messaging.onNotificationTap((message: any) => {
        console.log('[FCM] notification tapped:', JSON.stringify(message?.data));
        const siteId = message?.data?.site_id;
        if (siteId) {
          this.router.navigate(['/site', siteId]);
        }
      });

      messaging.onMessage((message: any) => {
        console.log('[FCM] foreground message:', JSON.stringify(message?.notification));
        if (message?.notification?.title) {
          const notif: AppNotification = {
            id: message.messageId ?? Date.now().toString(),
            title: message.notification.title,
            body: message.notification.body ?? '',
            type: message.data?.type ?? 'alert',
            data: message.data,
            created_at: new Date().toISOString(),
            read_at: null,
            read: false,
          };
          this.notificationsSubject.next([notif, ...this.notificationsSubject.value]);
          this.showLocalNotification(notif);
        }
      });

      console.log('[FCM] Init complete');
    } catch (e: any) {
      console.error('[FCM] init error:', e?.message ?? e);
      console.error('[FCM] stack:', e?.stack);
    }
  }

  private showLocalNotification(notif: AppNotification): void {
    try {
      if (typeof android === 'undefined') return;
      const context = Application.android.context;
      if (!context) return;

      const builder = new android.app.Notification.Builder(context, 'pei_alerts')
        .setContentTitle(notif.title)
        .setContentText(notif.body)
        .setSmallIcon(context.getApplicationInfo().icon)
        .setAutoCancel(true)
        .setPriority(android.app.Notification.PRIORITY_HIGH);

      const manager = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
      manager.notify(Date.now() & 0x7fffffff, builder.build());
    } catch (e: any) {
      console.error('[FCM] Failed to show local notification:', e?.message ?? e);
    }
  }

  private createNotificationChannel(): void {
    try {
      // Only needed on Android 8.0+ (API 26+)
      if (typeof android === 'undefined') return;
      const context = Application.android.context;
      if (!context) return;
      if (android.os.Build.VERSION.SDK_INT < 26) return;

      const channelId = 'pei_alerts';
      const manager = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
      console.log('[FCM] NotificationManager:', manager ? 'OK' : 'NULL');
      if (!manager) return;
      if (manager.getNotificationChannel(channelId) !== null) {
        console.log('[FCM] Notification channel already exists');
        return;
      }

      const channel = new android.app.NotificationChannel(
        channelId,
        'PEI Alerts',
        android.app.NotificationManager.IMPORTANCE_HIGH
      );
      channel.setDescription('Alerts when PLC tag thresholds are exceeded');
      channel.enableVibration(true);
      manager.createNotificationChannel(channel);
      console.log('[FCM] Notification channel created');
    } catch (e: any) {
      console.error('[FCM] Failed to create notification channel:', e?.message ?? e);
    }
  }

  private sendTokenToServer(token: string): void {
    this.http.post(`${environment.API_SERVER}/notifications/token`, {
      token,
      platform: 'android',
    }).subscribe({
      error: (err) => console.error('Failed to register FCM token:', err)
    });
  }

  loadUserNotifications(auth0_id: string): void {
    this.http.get<any>(
      `${environment.API_SERVER}/notifications/user/${encodeURIComponent(auth0_id)}?limit=50`
    ).subscribe({
      next: (response) => {
        const raw: any[] = Array.isArray(response)
          ? response
          : (response?.notifications ?? response?.data ?? []);
        const notifications: AppNotification[] = raw.map(n => ({
          ...n,
          id: n.id ?? n.notification_id ?? n._id,
          read_at: n.read_at ?? null,
          read: !!n.read_at,
        }));
        this.notificationsSubject.next(notifications);
      },
      error: (err) => console.error('Failed to load notifications:', err)
    });
  }

  markRead(id: string): void {
    const notification = this.notificationsSubject.value.find(n => n.id === id);
    if (!notification || notification.read) return;
    this.http.patch<{ notification: { read_at: string } }>(
      `${environment.API_SERVER}/notifications/${encodeURIComponent(id)}/read`, {}
    ).subscribe({
      next: (response) => {
        const read_at = response?.notification?.read_at ?? new Date().toISOString();
        this.notificationsSubject.next(
          this.notificationsSubject.value.map(n => n.id === id ? { ...n, read_at, read: true } : n)
        );
      },
      error: (err) => console.error('Failed to mark notification read:', err)
    });
  }

  deleteNotification(id: string): void {
    this.http.delete(`${environment.API_SERVER}/notifications/${encodeURIComponent(id)}`).subscribe({
      next: () => {
        this.notificationsSubject.next(this.notificationsSubject.value.filter(n => n.id !== id));
      },
      error: (err) => console.error('Failed to delete notification:', err)
    });
  }

  markAllRead(auth0_id: string): void {
    this.http.post(
      `${environment.API_SERVER}/notifications/user/${encodeURIComponent(auth0_id)}/read-all`, {}
    ).subscribe({
      next: () => {
        this.notificationsSubject.next(
          this.notificationsSubject.value.map(n => ({ ...n, read: true }))
        );
      },
      error: (err) => console.error('Failed to mark all notifications read:', err)
    });
  }
}
