import { withToggled } from './sets';

describe('withToggled', () => {
  it('nimmt einen Wert auf oder heraus', () => {
    expect([...withToggled(new Set([1, 2]), 3, true)]).toEqual([1, 2, 3]);
    expect([...withToggled(new Set([1, 2]), 2, false)]).toEqual([1]);
  });

  it('lässt die ursprüngliche Menge unverändert', () => {
    const original = new Set(['a']);
    withToggled(original, 'b', true);

    expect([...original]).toEqual(['a']);
  });
});
