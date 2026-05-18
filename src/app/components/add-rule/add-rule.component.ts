import { Component, Inject, OnInit, NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterExtensions, NativeScriptCommonModule } from '@nativescript/angular';
import { TenantService, TenantSite } from '../../services/tenant.service';
import { WebSocketService, PlcTag } from '../../services/websocket.service';
import { NotificationRulesService, RuleOperator, CreateRulePayload } from '../../services/notification-rules.service';

interface SiteOption {
  tenant_id: number;
  site_id: number;
  name: string;
}

const OPERATORS: { label: string; value: RuleOperator }[] = [
  { label: '> (greater than)', value: '>' },
  { label: '≥ (greater than or equal)', value: '>=' },
  { label: '< (less than)', value: '<' },
  { label: '≤ (less than or equal)', value: '<=' },
  { label: '= (equal to)', value: '=' },
  { label: '≠ (not equal to)', value: '!=' },
];

@Component({
  selector: 'app-add-rule',
  templateUrl: './add-rule.component.html',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class AddRuleComponent implements OnInit {
  sites: SiteOption[] = [];
  selectedSiteIndex = 0;

  tags: PlcTag[] = [];
  selectedTagIndex = 0;

  operators = OPERATORS;
  selectedOperatorIndex = 0;

  thresholdText = '';
  label = '';

  loading = false;
  saving = false;
  errorMessage = '';

  get selectedSite(): SiteOption | null {
    return this.sites[this.selectedSiteIndex] ?? null;
  }

  get selectedTag(): PlcTag | null {
    return this.tags[this.selectedTagIndex] ?? null;
  }

  get selectedOperator(): RuleOperator {
    return this.operators[this.selectedOperatorIndex].value;
  }

  get siteNames(): string[] {
    return this.sites.map(s => s.name);
  }

  get tagNames(): string[] {
    return this.tags.map(t => `${t.displayName}${t.unit ? ' (' + t.unit + ')' : ''}`);
  }

  get operatorLabels(): string[] {
    return this.operators.map(o => o.label);
  }

  get canSave(): boolean {
    return (
      this.sites.length > 0 &&
      this.tags.length > 0 &&
      this.thresholdText.trim() !== '' &&
      !isNaN(Number(this.thresholdText))
    );
  }

  constructor(
    @Inject(TenantService) private tenantService: TenantService,
    @Inject(WebSocketService) private webSocketService: WebSocketService,
    @Inject(NotificationRulesService) private rulesService: NotificationRulesService,
    @Inject(RouterExtensions) private router: RouterExtensions
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.tenantService.getTenantById(1001).subscribe({
      next: (tenant) => {
        this.sites = tenant.sites.map((s: TenantSite) => ({
          tenant_id: tenant.tenant_id,
          site_id: s.site_id,
          name: s.name,
        }));
        this.loading = false;
        // Auto-load tags for the first site
        this.loadTagsForSite(0);
      },
      error: (err) => {
        console.error('Failed to load sites:', err);
        this.errorMessage = 'Failed to load sites.';
        this.loading = false;
      }
    });
  }

  private loadTagsForSite(index: number): void {
    const site = this.sites[index];
    if (!site) return;
    this.tags = [];
    this.selectedTagIndex = 0;
    this.label = '';
    this.errorMessage = '';

    const snapshot = this.webSocketService.latestSnapshots.get(site.site_id);
    if (snapshot) {
      this.tags = snapshot.tags.filter(t => !t.error);
      if (this.tags.length > 0) {
        this.label = this.tags[0].displayName;
      }
    } else {
      this.errorMessage = 'No live data available for this site yet. Open the app home screen first to establish a connection.';
    }
  }

  onSiteSelected(index: number): void {
    this.selectedSiteIndex = index;
    this.loadTagsForSite(index);
  }

  onTagSelected(index: number): void {
    this.selectedTagIndex = index;
    this.errorMessage = '';
    if (this.selectedTag) {
      this.label = this.selectedTag.displayName;
    }
  }

  onOperatorSelected(index: number): void {
    this.selectedOperatorIndex = index;
  }

  save(): void {
    if (!this.canSave) return;
    this.saving = true;
    this.errorMessage = '';

    const site = this.selectedSite!;
    const tag = this.selectedTag!;

    const payload: CreateRulePayload = {
      tenant_id: site.tenant_id,
      site_id: site.site_id,
      site_name: site.name,
      tag_name: tag.name,
      tag_display_name: tag.displayName,
      tag_unit: tag.unit ?? '',
      operator: this.selectedOperator,
      threshold: Number(this.thresholdText),
      label: this.label.trim() || tag.displayName,
    };

    this.rulesService.createRule(payload).subscribe({
      next: () => {
        this.saving = false;
        this.router.back();
      },
      error: (err) => {
        console.error('Failed to create rule:', err);
        this.errorMessage = 'Failed to save rule. Please try again.';
        this.saving = false;
      }
    });
  }

  goBack(): void {
    this.router.back();
  }
}
