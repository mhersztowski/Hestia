/**
 * tsCompilerOptions.ts — ustawienia kompilatora dla edytora TypeScript/JavaScript.
 *
 * Osobno od wtyczki, bo wtyczka importuje `monaco-editor`, którego nie da się
 * wczytać poza przeglądarką — a to właśnie te ustawienia decydują o tym, czy
 * podpowiedzi w ogóle działają, i muszą dać się sprawdzić testem.
 */

/**
 * Fragment przestrzeni `monaco.languages.typescript`, z którego korzystamy.
 * Wartości tych wyliczeń są liczbowo takie same jak w pakiecie `typescript`,
 * więc test może podstawić prawdziwe enumy TypeScriptu.
 */
export interface TsNamespaceLike {
    ScriptTarget: { ES2020: number };
    ModuleKind: { ESNext: number };
    ModuleResolutionKind: { NodeJs: number };
    JsxEmit: { React: number };
}

/**
 * Opcje w kształcie, jaki przyjmuje `setCompilerOptions`.
 *
 * Sygnatura indeksowa jest wymagana przez typ Monaco (`CompilerOptions`
 * dopuszcza dowolne klucze), a nie ozdobą — bez niej obiekt nie przechodzi.
 */
export interface EditorCompilerOptions {
    [key: string]: string | number | boolean | string[] | undefined;
    target: number;
    module: number;
    moduleResolution: number;
    jsx: number;
    allowSyntheticDefaultImports: boolean;
    esModuleInterop: boolean;
    allowJs: boolean;
    strict: boolean;
    skipLibCheck: boolean;
    noEmit: boolean;
    isolatedModules: boolean;
    allowImportingTsExtensions: boolean;
    allowNonTsExtensions: boolean;
    checkJs?: boolean;
    /** Zobacz uwagę o `lib` niżej — celowo nieustawiane. */
    lib?: string[];
}

/**
 * Ustawienia wspólne dla obu języków edytora.
 *
 * ## Dlaczego nie ma tu `lib`
 *
 * W `tsconfig.json` wolno napisać `"lib": ["es2020", "dom"]`, bo parser pliku
 * mapuje te skróty na nazwy plików (`lib.es2020.d.ts`). Opcje podawane
 * programowo — a tędy idzie `setCompilerOptions` — tego parsera nie przechodzą:
 * TypeScript szuka wtedy plików nazwanych dosłownie „es2020" i „dom", nie
 * znajduje ich i buduje program **bez ani jednego pliku lib**.
 *
 * Objaw jest zwodniczy. Podpowiedzi nadal się pokazują — te ze słów obecnych
 * w pliku — więc edytor wygląda na sprawny. Ale `Array`, `string`, `Promise`
 * czy `document` są nieznane, więc po kropce nie ma nic i nic o tym nie mówi.
 *
 * Bez `lib` TypeScript bierze domyślny zestaw dla celu: dla ES2020 jest to
 * `lib.es2020.full.d.ts`, czyli standard języka razem z DOM — dokładnie to,
 * czego trzeba w edytorze webowym. Gdyby kiedyś trzeba było zawęzić ten zestaw,
 * trzeba wpisać **pełne nazwy plików**, nie skróty.
 */
export function buildCompilerOptions(ts: TsNamespaceLike): EditorCompilerOptions {
    return {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        // Monaco domyślnie rozwiązuje moduły „po staremu", czyli bez zaglądania
        // do `node_modules` — bez tego import po nazwie pakietu daje `any`,
        // choćby jego deklaracje były już wczytane.
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        jsx: ts.JsxEmit.React,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        allowJs: true,
        // Podpowiedzi nie mogą zależeć od tego, czy kod użytkownika przechodzi
        // tryb ścisły — to jego wybór, nie warunek działania edytora.
        strict: false,
        skipLibCheck: true,
        noEmit: true,
        isolatedModules: true,
        allowImportingTsExtensions: true,
        // Plik z Drive ma URI takie, jakie ma na dysku — bywa z rozszerzeniem,
        // którego TypeScript nie uzna za swoje. Bez tej opcji wypada z programu
        // i nie dostaje żadnych podpowiedzi.
        allowNonTsExtensions: true,
    };
}
