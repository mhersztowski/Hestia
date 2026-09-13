/**
 * Test regresyjny założenia, na którym stoi odświeżanie nazw zmiennych
 * w bloczkach odczytu (`minis_var_ref`, `minis_var_ref_cast`).
 *
 * Pola te są dynamicznymi dropdownami: wartością jest id bloku deklaracji,
 * a etykietą aktualna nazwa. Po zmianie nazwy trzeba odświeżyć podpis, ale
 * `forceRerender()` tego nie robi — dopiero ponowne `setValue` tej samej
 * wartości przelicza zapamiętaną opcję. Gdyby przyszła wersja Blockly to
 * zmieniła, ten test pęknie i wskaże, gdzie szukać.
 */
import { describe, it, expect } from 'vitest';
import * as Blockly from 'blockly';

let currentName = 'licznik';
const options = (): [string, string][] => [[currentName, 'DECL_ID']];

Blockly.Blocks['test_var_ref'] = {
  init(this: Blockly.Block) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.appendDummyInput().appendField(new Blockly.FieldDropdown(options as any), 'NAME');
  },
};

interface DynField extends Blockly.Field {
  getOptions(useCache: boolean): unknown;
  forceRerender(): void;
}

describe('odświeżanie etykiety dynamicznego dropdownu', () => {
  it('forceRerender NIE wystarcza, setValue tą samą wartością — tak', () => {
    currentName = 'licznik';
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('test_var_ref');
    const field = block.getField('NAME') as DynField;
    expect(field.getText()).toBe('licznik');
    expect(field.getValue()).toBe('DECL_ID');

    currentName = 'suma';                    // zmiana nazwy w „deklaracji"
    expect(field.getOptions(false)).toEqual([['suma', 'DECL_ID']]);

    field.forceRerender();
    expect(field.getText()).toBe('licznik'); // stąd bierze się błąd w edytorze

    field.setValue(field.getValue());
    expect(field.getText()).toBe('suma');    // sposób użyty w refreshVarRefLabels
  });

  it('wartość (id deklaracji) zostaje niezmieniona po odświeżeniu', () => {
    currentName = 'a';
    const ws = new Blockly.Workspace();
    const field = ws.newBlock('test_var_ref').getField('NAME') as DynField;
    currentName = 'b';
    field.getOptions(false);
    field.setValue(field.getValue());
    expect(field.getValue()).toBe('DECL_ID');
    expect(field.getText()).toBe('b');
  });
});
