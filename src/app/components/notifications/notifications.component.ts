import { Component, OnInit, NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterExtensions, NativeScriptCommonModule } from '@nativescript/angular';
import { NotificationRulesService, NotificationRule } from '../../services/notification-rules.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class NotificationsComponent implements OnInit {
  rules: NotificationRule[] = [];
  loading = true;

  constructor(
    private rulesService: NotificationRulesService,
    private router: RouterExtensions
  ) {}

  ngOnInit(): void {
    this.loadRules();
  }

  loadRules(): void {
    this.loading = true;
    this.rulesService.getRules().subscribe({
      next: (rules) => {
        this.rules = rules;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load rules:', err);
        this.loading = false;
      }
    });
  }

  operatorLabel(op: string): string {
    const map: Record<string, string> = {
      '>': '>', '>=': '≥', '<': '<', '<=': '≤', '=': '=', '!=': '≠'
    };
    return map[op] ?? op;
  }

  toggleRule(rule: NotificationRule): void {
    const newEnabled = !rule.enabled;
    this.rulesService.toggleRule(rule.id, newEnabled).subscribe({
      next: () => {
        rule.enabled = newEnabled;
      },
      error: (err) => console.error('Failed to toggle rule:', err)
    });
  }

  deleteRule(rule: NotificationRule): void {
    this.rulesService.deleteRule(rule.id).subscribe({
      next: () => {
        this.rules = this.rules.filter(r => r.id !== rule.id);
      },
      error: (err) => console.error('Failed to delete rule:', err)
    });
  }

  addRule(): void {
    this.router.navigate(['/add-rule']);
  }

  goBack(): void {
    this.router.back();
  }
}
