import { Directive, ElementRef, inject, input, output } from '@angular/core';
import { RatingValue, ratingClass, ratingSymbol } from '../../core/models';

/** Ab dieser Strecke (px) zählt das Wischen als + bzw. −. */
const STEP_ONE = 50;
/** Ab dieser Strecke (px) als ++ bzw. −−. */
const STEP_TWO = 130;
/** So weit folgt die Kachel dem Finger höchstens. */
const MAX_SHIFT = 160;

/** Strecke in eine Bewertung übersetzen - zu kurz heißt: keine. */
export function swipeValue(dx: number): RatingValue | null {
  const distance = Math.abs(dx);
  if (distance < STEP_ONE) {
    return null;
  }
  const step = distance >= STEP_TWO ? 2 : 1;
  return (Math.sign(dx) * step) as RatingValue;
}

/**
 * Schnellbewertung per Wischen: nach rechts + (weit: ++), nach links −
 * (weit: −−). Die Kachel folgt dem Finger und zeigt schon unterwegs, was
 * beim Loslassen vergeben wird. Senkrechtes Wischen scrollt wie gewohnt.
 */
@Directive({
  selector: '[appSwipeRate]',
  host: {
    '[style.touch-action]': "swipeDisabled() ? null : 'pan-y'",
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'reset()',
  },
})
export class SwipeRate {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly swipeDisabled = input(false);
  readonly swipeRate = output<RatingValue>();

  private start: { x: number; y: number; id: number } | null = null;
  private active = false;
  private suppressClick = false;

  constructor() {
    // In der Capture-Phase, damit der Klick die Knöpfe in der Kachel gar nicht erst erreicht.
    this.host.addEventListener('click', (event) => this.onClick(event), true);
  }

  onDown(event: PointerEvent): void {
    if (this.swipeDisabled() || !event.isPrimary || event.button !== 0) {
      return;
    }
    this.start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    this.active = false;
  }

  onMove(event: PointerEvent): void {
    const start = this.start;
    if (!start || event.pointerId !== start.id) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (!this.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        // Senkrecht: Das ist Scrollen, kein Bewerten.
        this.start = null;
        return;
      }
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) {
        return;
      }
      this.active = true;
      this.host.setPointerCapture?.(start.id);
      this.host.classList.add('swiping');
    }

    const shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dx));
    const value = swipeValue(dx);
    this.host.style.setProperty('--swipe', `${shift}px`);
    if (value === null) {
      this.host.removeAttribute('data-swipe');
      this.host.style.removeProperty('--swipe-color');
    } else {
      this.host.setAttribute('data-swipe', ratingSymbol(value));
      this.host.style.setProperty('--swipe-color', `var(--${ratingClass(value)})`);
    }
  }

  onUp(event: PointerEvent): void {
    const start = this.start;
    if (!start || event.pointerId !== start.id) {
      return;
    }
    const wasActive = this.active;
    const value = swipeValue(event.clientX - start.x);
    this.reset();
    if (!wasActive) {
      return;
    }
    // Der Klick nach dem Loslassen soll nicht noch die Knöpfe öffnen.
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 400);
    if (value !== null) {
      this.swipeRate.emit(value);
    }
  }

  onClick(event: MouseEvent): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  reset(): void {
    this.start = null;
    this.active = false;
    this.host.classList.remove('swiping');
    this.host.removeAttribute('data-swipe');
    this.host.style.removeProperty('--swipe');
    this.host.style.removeProperty('--swipe-color');
  }
}
