/**
 * Bloczek Blockly o zmiennej liczbie wejść — `emit`/`call` z MinisLib.
 *
 * Osobny moduł, bo `VisualMinisLibPlugin.tsx` ciągnie Monaco i ReactFlow,
 * a przebudowa wejść bloczka to logika, którą trzeba móc uruchomić w teście.
 */
import * as Blockly from 'blockly';
import { javascriptGenerator, Order } from 'blockly/javascript';
import type { SignalArg } from './classMembers';

/** Para [etykieta, wartość] dla `FieldDropdown`. */
export type BMenuOpt = [string, string];

/**
 * Bloczek wywołania o zmiennej liczbie wejść: liczba argumentów bierze się
 * z wybranej nazwy (arności sygnału albo sygnatury slotu), a nie jest ustalona
 * na sztywno. Wcześniej `emit` i `call` miały dokładnie jedno wejście, więc
 * sygnał `Signal<[x, y]>` dawał się wyemitować tylko połowicznie — i nic tego
 * nie sygnalizowało poza błędem kompilacji.
 */
export interface DynArgsBlock extends Blockly.Block {
  argCount_: number;
  updateShape_(n: number): void;
}

export function defineDynArgsBlock(cfg: {
  type: string;
  colour: number;
  tooltip: string;
  prefix: string;
  suffix: string;
  /** Nazwa pierwszego wejścia — zachowana z czasów jednoargumentowych. */
  firstInput: string;
  nameOpts: () => BMenuOpt[];
  argsFor: (name: string) => SignalArg[];
  code: (name: string, args: string[]) => string;
}): void {
  const inputName = (i: number) => (i === 0 ? cfg.firstInput : `ARG${i}`);

  Blockly.Blocks[cfg.type] = {
    init(this: DynArgsBlock) {
      this.appendDummyInput('HEAD')
        .appendField(cfg.prefix)
        .appendField(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new Blockly.FieldDropdown(cfg.nameOpts as any, function (
            this: Blockly.Field,
            value: string
          ) {
            // Kształt zmieniamy poza walidacją: w jej trakcie pole nie ma
            // jeszcze nowej wartości, a przebudowa wejść generuje zdarzenia,
            // których Blockly nie spodziewa się w środku `setValue`.
            const block = this.getSourceBlock() as DynArgsBlock | null;
            if (block)
              setTimeout(() => {
                if (!block.isDisposed()) block.updateShape_(cfg.argsFor(value).length);
              }, 0);
            return undefined;
          }),
          'NAME'
        )
        .appendField(cfg.suffix);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(cfg.colour);
      this.setTooltip(cfg.tooltip);
      this.argCount_ = 0;
      // Jedno wejście na start — tyle miały wszystkie takie bloczki dotąd,
      // więc zapis sprzed tej zmiany (bez `extraState`) wygląda tak samo.
      this.updateShape_(1);
    },

    saveExtraState(this: DynArgsBlock) {
      return { args: this.argCount_ };
    },

    loadExtraState(this: DynArgsBlock, state: { args?: number }) {
      this.updateShape_(typeof state?.args === 'number' ? state.args : 1);
    },

    updateShape_(this: DynArgsBlock, n: number) {
      if (n === this.argCount_ && this.getInput('TAIL')) return;
      const name = String(this.getFieldValue('NAME') || '');
      const labels = cfg.argsFor(name);
      // Wejścia budujemy od zera, więc wpięte wyrażenia trzeba zapamiętać
      // i podłączyć ponownie — inaczej po każdej zmianie nazwy sygnału
      // zostawałyby luzem na kanwie, choć argument nadal istnieje.
      const kept: Array<Blockly.Connection | null> = [];
      for (let i = 0; i < this.argCount_; i++) {
        const input = this.getInput(inputName(i));
        const target = input?.connection?.targetConnection ?? null;
        if (target) input!.connection!.disconnect();
        kept.push(target);
        if (input) this.removeInput(inputName(i), true);
      }
      if (this.getInput('TAIL')) this.removeInput('TAIL', true);

      for (let i = 0; i < n; i++) {
        const input = this.appendValueInput(inputName(i));
        const label = labels[i]?.name?.trim();
        if (label) input.appendField(`${label}:`);
      }
      if (n > 0) this.appendDummyInput('TAIL').appendField(')');
      this.setInputsInline(n <= 1);
      this.argCount_ = n;

      for (let i = 0; i < Math.min(kept.length, n); i++) {
        const target = kept[i];
        const input = this.getInput(inputName(i));
        if (!target || !input?.connection) continue;
        try {
          input.connection.connect(target);
        } catch {
          /* typ się nie zgadza — blok zostaje luzem */
        }
      }
    },
  };

  javascriptGenerator.forBlock[cfg.type] = (block, gen) => {
    const name = block.getFieldValue('NAME') || '';
    if (!name) return '';
    const count = (block as DynArgsBlock).argCount_ ?? 0;
    const args: string[] = [];
    for (let i = 0; i < count; i++) {
      args.push(gen.valueToCode(block, inputName(i), Order.NONE) || 'undefined');
    }
    return cfg.code(name, args);
  };
}
