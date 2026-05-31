import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PlcTag } from './websocket.service';

export interface PlcSnapshot {
  _id?: string;
  timestamp: string;
  site_id: number;
  tenant_id: number;
  tags: PlcTag[];
}

export interface Site {
  site_id: number;
  name: string;
  connection_status: 'online' | 'warning' | 'offline';
  app_version?: string;
}

export interface UptimeSession {
  connected_at: string;
  disconnected_at: string | null;
  duration_ms: number | null;
  disconnect_reason: string | null;
  connection_source: 'app' | 'service' | 'unknown';
}

export interface SiteUptime {
  tenant_id: number;
  site_id: number;
  days: number;
  start_date: string;
  end_date: string;
  total_time_ms: number;
  total_uptime_ms: number;
  uptime_percentage: number;
  sessions: UptimeSession[];
}

export interface SiteDataReading {
  site_id: number;
  tenant_id: number;
  timestamp: string;
  flr_flow: number;
  ch4: number;
  inlet_pressure: number;
  o2: number;
  flr_sdv: number;
}

export interface LatestReadingsResponse {
  tenant_id: number;
  sites: SiteDataReading[];
}

export interface SiteFile {
  _id: string;
  tenant_id: number;
  site_id: number;
  filename: string;
  size: number;
  source: string;
  sha256: string;
  category: 'accounting_log' | 'flare_data' | 'cr_files';
  modifiedAt: string;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class SiteService {

  constructor(private http: HttpClient) { }

  getAllSites(): Observable<Site[]> {
    return this.http.get<Site[]>(`${environment.API_SERVER}/site/getAllsites`);
  }

  getSiteById(site_id: number): Observable<Site> {
    return this.http.get<Site>(`${environment.API_SERVER}/site/getSiteById/${site_id}`);
  }

  getSiteUptime(tenant_id: number, site_id: number, days: number = 7): Observable<SiteUptime> {
    return this.http.get<SiteUptime>(`${environment.API_SERVER}/site/uptime/${tenant_id}/${site_id}?days=${days}`);
  }

  getSiteFiles(tenant_id: number, site_id: number): Observable<SiteFile[]> {
    return this.http.get<SiteFile[]>(`${environment.API_SERVER}/files/${tenant_id}/${site_id}`);
  }

  getLatestReadings(tenant_id: number): Observable<LatestReadingsResponse> {
    return this.http.get<LatestReadingsResponse>(`${environment.API_SERVER}/accounting/${tenant_id}/latest`);
  }

  downloadFile(file_id: string): Observable<ArrayBuffer> {
    return this.http.get(`${environment.API_SERVER}/files/download/${file_id}`, { responseType: 'arraybuffer' });
  }

  getSiteSnapshots(tenant_id: number, site_id: number): Observable<PlcSnapshot[]> {
    return this.http.get<PlcSnapshot[]>(`${environment.API_SERVER}/plc/${tenant_id}/${site_id}/snapshots`);
  }
}
