import { Component, Input, Output, EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { Site } from '../../services/site.service';
import { PlcSnapshot, PlcTag } from '../../services/websocket.service';

@Component({
  selector: 'app-site-card',
  templateUrl: './site-card.component.html',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class SiteCardComponent {
  @Input() siteData!: Site;
  @Input() snapshot?: PlcSnapshot;
  @Output() siteTap = new EventEmitter<void>();

  get activeTags(): PlcTag[] {
    if (!this.snapshot) return [];
    return this.snapshot.tags.filter(t => !t.error);
  }

  get statusColor(): string {
    if (this.siteData.connection_status === 'online') return '#30D158';
    if (this.siteData.connection_status === 'warning') return '#FF9F0A';
    return '#FF453A';
  }

  get statusLabel(): string {
    if (this.siteData.connection_status === 'online') return 'Online';
    if (this.siteData.connection_status === 'warning') return 'Warning';
    return 'Offline';
  }

  get formattedTimestamp(): string {
    if (!this.snapshot?.timestamp) return '--';
    const d = new Date(this.snapshot.timestamp);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
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

  onTap(): void {
    this.siteTap.emit();
  }
}
