import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TenantSite {
  site_id: number;
  name: string;
  api_key?: string;
  connection_status?: boolean;
  last_seen?: string;
  app_version?: string;
}

export interface Tenant {
  _id: string;
  tenant_id: number;
  name: string;
  sites: TenantSite[];
  __v?: number;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TenantService {

  constructor(private http: HttpClient) { }

  getTenantById(tenant_id: number): Observable<Tenant> {
    return this.http.get<Tenant>(`${environment.API_SERVER}/tenant/getTenantById/${tenant_id}`);
  }
}
