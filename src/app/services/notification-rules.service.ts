import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type RuleOperator = '>' | '>=' | '<' | '<=' | '=' | '!=';

export interface NotificationRule {
  id: string;
  tenant_id: number;
  site_id: number;
  site_name: string;
  tag_name: string;
  tag_display_name: string;
  tag_unit: string;
  operator: RuleOperator;
  threshold: number;
  label: string;
  enabled: boolean;
  created_at: string;
}

export interface CreateRulePayload {
  tenant_id: number;
  site_id: number;
  site_name: string;
  tag_name: string;
  tag_display_name: string;
  tag_unit: string;
  operator: RuleOperator;
  threshold: number;
  label: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationRulesService {
  private readonly base = `${environment.API_SERVER}/notifications/rules`;

  constructor(private http: HttpClient) {}

  getRules(): Observable<NotificationRule[]> {
    return this.http.get<any>(this.base).pipe(
      map(res => Array.isArray(res) ? res : (res?.rules ?? res?.data ?? []))
    );
  }

  createRule(payload: CreateRulePayload): Observable<NotificationRule> {
    return this.http.post<any>(this.base, payload).pipe(
      map(res => res?.rule ?? res)
    );
  }

  toggleRule(id: string, enabled: boolean): Observable<void> {
    return this.http.patch<void>(
      `${this.base}/${encodeURIComponent(id)}`,
      { enabled }
    );
  }

  deleteRule(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${encodeURIComponent(id)}`);
  }
}
