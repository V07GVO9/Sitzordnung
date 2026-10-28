/**
 * Regeln für ein neues Passwort. Die Datei lässt sich offline beliebig oft
 * durchprobieren - ihr Schutz hängt allein an der Stärke des Passworts.
 */

export interface PasswordRule {
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { label: 'mehr als 10 Zeichen', test: (p) => [...p].length > 10 },
  { label: 'ein Großbuchstabe', test: (p) => /\p{Lu}/u.test(p) },
  { label: 'eine Zahl', test: (p) => /\p{Nd}/u.test(p) },
  { label: 'ein Sonderzeichen', test: (p) => /[^\p{L}\p{Nd}\s]/u.test(p) },
];

/** Die Regeln, die das Passwort noch nicht erfüllt. */
export function unmetPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password));
}

export function isStrongPassword(password: string): boolean {
  return unmetPasswordRules(password).length === 0;
}
