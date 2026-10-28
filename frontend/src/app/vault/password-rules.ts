import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '../core/ui/icon';
import { PASSWORD_RULES } from '../core/store/password-policy';

/** Hakt beim Tippen ab, welche Regeln das neue Passwort schon erfüllt. */
@Component({
  selector: 'app-password-rules',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <ul aria-label="Anforderungen an das Passwort">
      @for (rule of rules(); track rule.label) {
        <li [class.met]="rule.met">
          <app-icon [name]="rule.met ? 'circle-check' : 'x'" />
          {{ rule.label }}
          <span class="visually-hidden">{{ rule.met ? '(erfüllt)' : '(fehlt)' }}</span>
        </li>
      }
    </ul>
  `,
  styles: [
    `
      ul {
        display: grid;
        gap: 0.2rem;
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 0.85rem;
        color: var(--text-muted);
      }

      li {
        display: flex;
        align-items: center;
        gap: 0.4rem;
      }

      li.met {
        color: var(--positive);
      }

      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    `,
  ],
})
export class PasswordRules {
  readonly password = input.required<string>();

  readonly rules = computed(() =>
    PASSWORD_RULES.map((rule) => ({ label: rule.label, met: rule.test(this.password()) })),
  );
}
