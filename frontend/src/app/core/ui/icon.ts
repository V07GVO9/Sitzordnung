import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICONS, IconName } from './icons';

/**
 * Ein Symbol in Textgröße. Es übernimmt die Schriftfarbe und ist für
 * Screenreader unsichtbar - die Bedeutung trägt immer der Text daneben
 * oder ein aria-label am Knopf.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @for (shape of shapes(); track $index) {
        @switch (shape.t) {
          @case ('path') {
            <svg:path [attr.d]="shape['d']" />
          }
          @case ('circle') {
            <svg:circle [attr.cx]="shape['cx']" [attr.cy]="shape['cy']" [attr.r]="shape['r']" />
          }
          @case ('rect') {
            <svg:rect
              [attr.x]="shape['x']"
              [attr.y]="shape['y']"
              [attr.width]="shape['width']"
              [attr.height]="shape['height']"
              [attr.rx]="shape['rx']"
            />
          }
          @case ('line') {
            <svg:line
              [attr.x1]="shape['x1']"
              [attr.y1]="shape['y1']"
              [attr.x2]="shape['x2']"
              [attr.y2]="shape['y2']"
            />
          }
        }
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
        width: 1.15em;
        height: 1.15em;
        line-height: 0;
      }

      svg {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class Icon {
  readonly name = input.required<IconName>();

  readonly shapes = computed(() => ICONS[this.name()]);
}
