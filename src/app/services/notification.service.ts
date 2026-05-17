import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { WebSocketService } from './websocket.service';

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

  constructor(
    private http: HttpClient,
    private webSocketService: WebSocketService
  ) {
    this.webSocketService.notification$.subscribe(wsNotif => {
      const notification: AppNotification = { ...wsNotif, read_at: null, read: false };
      this.notificationsSubject.next([notification, ...this.notificationsSubject.value]);
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

    this.http.patch<{ notification: { read_at: string } }>(`${environment.API_SERVER}/notifications/${encodeURIComponent(id)}/read`, {}).subscribe({
      next: (response) => {
        const read_at = response?.notification?.read_at ?? new Date().toISOString();
        const updated = this.notificationsSubject.value.map(n =>
          n.id === id ? { ...n, read_at, read: true } : n
        );
        this.notificationsSubject.next(updated);
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
      `${environment.API_SERVER}/notifications/user/${encodeURIComponent(auth0_id)}/read-all`,
      {}
    ).subscribe({
      next: () => {
        const updated = this.notificationsSubject.value.map(n => ({ ...n, read: true }));
        this.notificationsSubject.next(updated);
      },
      error: (err) => console.error('Failed to mark all notifications read:', err)
    });
  }
}
