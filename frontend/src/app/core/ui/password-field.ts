import { ChangeDetectionStrategy, Component, ElementRef, contentChild, effect, input, signal } from '@angular/core';

/** Behält das originale Formularfeld und ergänzt den Sichtbarkeitsschalter. */
@Component({
  selector: 'app-password-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-content />
    <button
      type="button"
      [attr.aria-label]="visible() ? 'Passwort verbergen' : 'Passwort anzeigen'"
      [attr.title]="visible() ? 'Passwort verbergen' : 'Passwort anzeigen'"
      [attr.aria-pressed]="visible()"
      (click)="visible.set(!visible())"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        @if (visible()) { <path d="m3 3 18 18" /> }
      </svg>
    </button>
  `,
  styles: [`
    :host { display: flex; position: relative; width: 100%; min-width: 0; }
    button {
      position: absolute; right: 1px; top: 1px; bottom: 1px;
      display: grid; place-items: center; width: 2.75rem;
      border: 0; border-radius: var(--radius-sm); background: transparent;
      color: var(--text-muted); cursor: pointer;
    }
    button:hover { background: var(--surface-hover); color: var(--text); }
    svg { width: 1.2rem; height: 1.2rem; }
  `],
})
export class PasswordField {
  readonly value = input.required<string>();
  readonly visible = signal(false);
  private readonly field = contentChild.required<ElementRef<HTMLInputElement>>('passwordInput');

  constructor() {
    effect(() => {
      if (this.value() === '') this.visible.set(false);
    });
    effect(() => {
      this.field().nativeElement.type = this.visible() ? 'text' : 'password';
    });
  }
}
