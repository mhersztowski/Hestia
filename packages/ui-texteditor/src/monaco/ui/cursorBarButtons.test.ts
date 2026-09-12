/**
 * Pasek kursora ma komplet ruchów i nazwy komend zgodne z Monaco.
 *
 * Literówka w nazwie komendy nie wysypuje niczego — `editor.trigger` po prostu
 * nic nie robi, więc przycisk milczy. Dlatego pilnujemy tu listy wprost.
 */
import { describe, it, expect } from 'vitest';
import { CURSOR_BAR_BUTTONS } from './cursorBarButtons';

describe('CURSOR_BAR_BUTTONS', () => {
  it('zawiera wszystkie osiem ruchów kursora', () => {
    expect(CURSOR_BAR_BUTTONS.map((b) => b.command)).toEqual([
      'cursorTop', 'cursorHome', 'cursorLeft', 'cursorUp',
      'cursorDown', 'cursorRight', 'cursorEnd', 'cursorBottom',
    ]);
  });

  it('używa nazw komend wbudowanych w Monaco (camelCase, bez prefiksów)', () => {
    for (const { command } of CURSOR_BAR_BUTTONS) {
      expect(command).toMatch(/^cursor[A-Z][A-Za-z]+$/);
    }
  });

  it('każdy przycisk ma opis i żadna komenda się nie powtarza', () => {
    const commands = CURSOR_BAR_BUTTONS.map((b) => b.command);
    expect(new Set(commands).size).toBe(commands.length);
    for (const { title } of CURSOR_BAR_BUTTONS) expect(title.length).toBeGreaterThan(3);
  });

  it('skoki po pliku są na skrajach paska — tam, gdzie trudniej trafić przypadkiem', () => {
    expect(CURSOR_BAR_BUTTONS[0].command).toBe('cursorTop');
    expect(CURSOR_BAR_BUTTONS.at(-1)?.command).toBe('cursorBottom');
  });
});
