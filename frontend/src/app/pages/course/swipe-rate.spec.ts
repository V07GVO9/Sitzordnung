import { swipeValue } from './swipe-rate';

describe('swipeValue', () => {
  it('übersetzt die Wischstrecke in eine Bewertung', () => {
    expect(swipeValue(20)).toBeNull();
    expect(swipeValue(-49)).toBeNull();
    expect(swipeValue(60)).toBe(1);
    expect(swipeValue(-60)).toBe(-1);
    expect(swipeValue(140)).toBe(2);
    expect(swipeValue(-300)).toBe(-2);
  });
});
