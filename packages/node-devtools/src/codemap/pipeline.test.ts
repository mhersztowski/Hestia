import { describe, it, expect } from 'vitest';
import { buildModel } from './parsers/index.js';
import { createCodemap } from './document.js';
import { generateTs } from './codegen/tsCodegen.js';
import { diagramToModel } from './uml/umlToModel.js';
import { CodemapService } from './CodemapService.js';

const SRC = `
export abstract class Animal {
  protected name: string;
  abstract makeSound(): void;
}
export class Dog extends Animal implements Pet {
  private breed: string;
  makeSound(): void {}
  fetch(): void {}
}
export interface Pet {
  name: string;
  feed(food: string): void;
}
export class Owner {
  pets: Animal;
  adopt(a: Animal): void {}
}
`;

describe('devtools TS pipeline', () => {
  it('parses classes, interfaces, members and relations', async () => {
    const model = await buildModel([{ file: 'src/zoo.ts', content: SRC, language: 'typescript' }]);
    const names = model.symbols.map((s) => s.name).sort();
    expect(names).toEqual(['Animal', 'Dog', 'Owner', 'Pet']);

    const animal = model.symbols.find((s) => s.name === 'Animal')!;
    expect(animal.kind).toBe('class');
    expect(animal.isAbstract).toBe(true);
    expect(animal.members.find((m) => m.name === 'makeSound')?.kind).toBe('method');

    // generalization Dog→Animal, realization Dog→Pet, association Owner→Animal
    const rel = (from: string, to: string) => model.relations.find((r) => model.symbols.find((s) => s.id === r.fromId)?.name === from && model.symbols.find((s) => s.id === r.toId)?.name === to);
    expect(rel('Dog', 'Animal')?.type).toBe('generalization');
    expect(rel('Dog', 'Pet')?.type).toBe('realization');
    expect(rel('Owner', 'Animal')?.type).toBe('association');
  });

  it('creates a loadable codemap', async () => {
    const model = await buildModel([{ file: 'src/zoo.ts', content: SRC }]);
    const codemap = createCodemap(model, 'Zoo', 'src');
    expect(codemap.type).toBe('codemap');
    expect(codemap.version).toBe(1);
    expect(codemap.diagrams[0].nodes.length).toBe(4);
    expect(Object.keys(codemap.history.branches)).toContain('main');
    const dog = codemap.diagrams[0].nodes.find((n) => n.data.name === 'Dog')!;
    expect(dog.data.linkedFile).toBe('src/zoo.ts');
    expect(dog.data.members.some((m) => m.kind === 'method' && m.text.includes('fetch'))).toBe(true);
  });

  it('records add/remove/modify changes as a commit on re-sync', async () => {
    const svc = new CodemapService();
    const m1 = await buildModel([{ file: 'src/zoo.ts', content: SRC }]);
    const codemap = createCodemap(m1, 'Zoo', 'src');
    const commitsBefore = Object.keys(codemap.history.commits).length;

    const SRC2 = SRC.replace('fetch(): void {}', 'fetch(): boolean {}') + '\nexport class Cat extends Animal { makeSound(): void {} }\n';
    const m2 = await buildModel([{ file: 'src/zoo.ts', content: SRC2 }]);
    const res = svc.applyModel(codemap, m2);

    expect(res.committed).toBe(true);
    expect(res.changes.some((c) => c.kind === 'added' && c.symbol === 'Cat')).toBe(true);
    expect(res.changes.some((c) => c.kind === 'modified' && c.target === 'method')).toBe(true);
    expect(Object.keys(res.codemap.history.commits).length).toBe(commitsBefore + 1);
  });

  it('treats a method signature change as modified (not remove+add)', async () => {
    const svc = new CodemapService();
    const A = `export class Svc { func2(arg1: number): void {} }`;
    const B = `export class Svc { func2(arg1: number, arg2: string): void {} }`;
    const codemap = createCodemap(await buildModel([{ file: 'a.ts', content: A }]), 'S');
    const res = svc.applyModel(codemap, await buildModel([{ file: 'a.ts', content: B }]));
    const methodChanges = res.changes.filter((c) => c.target === 'method');
    expect(methodChanges.length).toBe(1);
    expect(methodChanges[0].kind).toBe('modified');
    expect(methodChanges[0].from).toContain('func2(arg1');
    expect(methodChanges[0].to).toContain('arg2');
  });

  it('round-trips UML back into TypeScript skeletons', async () => {
    const model = await buildModel([{ file: 'src/zoo.ts', content: SRC }]);
    const codemap = createCodemap(model, 'Zoo');
    const back = diagramToModel(codemap.diagrams[0], 'typescript');
    const files = generateTs(back);
    const dog = files.find((f) => f.file === 'Dog.ts')!;
    expect(dog.content).toContain('class Dog');
    expect(dog.content).toContain('extends Animal');
    expect(dog.content).toContain('fetch(');
  });
});

describe('devtools C/C++ pipeline', () => {
  it('parses named C struct', async () => {
    const code = `struct Point { int x; int y; };`;
    const model = await buildModel([{ file: 'geo.c', content: code, language: 'c' }]);
    expect(model.symbols.map((s) => s.name)).toContain('Point');
    const pt = model.symbols.find((s) => s.name === 'Point')!;
    expect(pt.members.some((m) => m.name === 'x')).toBe(true);
  });

  it('parses anonymous typedef struct (most common C pattern)', async () => {
    const code = `typedef struct { int x; int y; } Point;`;
    const model = await buildModel([{ file: 'geo.c', content: code, language: 'c' }]);
    expect(model.symbols.map((s) => s.name)).toContain('Point');
    const pt = model.symbols.find((s) => s.name === 'Point')!;
    expect(pt.members.some((m) => m.name === 'x')).toBe(true);
  });

  it('parses multiple typedef structs in one file', async () => {
    const code = `
typedef struct { float x; float y; float z; } Vec3;
typedef struct { Vec3 min; Vec3 max; } AABB;
`;
    const model = await buildModel([{ file: 'math.c', content: code, language: 'c' }]);
    const names = model.symbols.map((s) => s.name).sort();
    expect(names).toEqual(['AABB', 'Vec3']);
    const vec = model.symbols.find((s) => s.name === 'Vec3')!;
    expect(vec.members.length).toBe(3);
  });

  it('parses C++ class in .h header file', async () => {
    const code = `
class Sensor {
public:
  int read();
private:
  int _pin;
};
`;
    const model = await buildModel([{ file: 'Sensor.h', content: code }]);
    expect(model.symbols.map((s) => s.name)).toContain('Sensor');
    const s = model.symbols.find((s) => s.name === 'Sensor')!;
    expect(s.members.some((m) => m.name === 'read' && m.kind === 'method')).toBe(true);
    expect(s.members.some((m) => m.name === '_pin' && m.kind === 'field')).toBe(true);
  });

  it('parses Arduino .ino file as C++', async () => {
    const code = `
class MyDevice {
public:
  void begin(int pin);
  void loop();
private:
  int _pin;
};
void setup() {}
void loop() {}
`;
    const model = await buildModel([{ file: 'sketch.ino', content: code }]);
    expect(model.symbols.map((s) => s.name)).toContain('MyDevice');
    const d = model.symbols.find((s) => s.name === 'MyDevice')!;
    expect(d.members.some((m) => m.name === 'begin')).toBe(true);
  });

  it('parses methods with reference return type (PubSubClient& pattern)', async () => {
    const code = `
class PubSubClient {
public:
  PubSubClient& setServer(uint16_t port);
  PubSubClient& setServer(uint8_t* ip, uint16_t port);
  PubSubClient& setCallback(void (*callback)(char*, uint8_t*, unsigned int));
  boolean connect(const char* id);
private:
  uint16_t _port;
};
`;
    const model = await buildModel([{ file: 'PubSubClient.h', content: code }]);
    expect(model.symbols.map((s) => s.name)).toContain('PubSubClient');
    const cls = model.symbols.find((s) => s.name === 'PubSubClient')!;
    const methods = cls.members.filter((m) => m.kind === 'method');
    const fields = cls.members.filter((m) => m.kind === 'field');
    expect(methods.some((m) => m.name === 'setServer')).toBe(true);
    expect(methods.some((m) => m.name === 'connect')).toBe(true);
    expect(fields.some((f) => f.name === 'setServer')).toBe(false); // must NOT be a field
    expect(fields.map((f) => f.name)).toEqual(['_port']);
  });

  it('marks static methods and fields with isStatic in C++', async () => {
    const code = `
class Counter {
public:
  static int getCount();
  static Counter* getInstance();
  void increment();
private:
  static int count_;
  int value_;
};
`;
    const model = await buildModel([{ file: 'Counter.h', content: code }]);
    const cls = model.symbols.find((s) => s.name === 'Counter')!;
    expect(cls).toBeDefined();
    const getCount = cls.members.find((m) => m.name === 'getCount');
    expect(getCount?.isStatic).toBe(true);
    const getInstance = cls.members.find((m) => m.name === 'getInstance');
    expect(getInstance?.isStatic).toBe(true);
    const increment = cls.members.find((m) => m.name === 'increment');
    expect(increment?.isStatic).toBeFalsy();
    const count_ = cls.members.find((m) => m.name === 'count_');
    expect(count_?.isStatic).toBe(true);
    const value_ = cls.members.find((m) => m.name === 'value_');
    expect(value_?.isStatic).toBeFalsy();
    // rendered text must contain 'static' keyword
    expect(getCount?.text).toContain('static');
    expect(count_?.text).toContain('static');
    expect(increment?.text).not.toContain('static');
  });
});

describe('devtools module-level globals', () => {
  it('collects top-level TS functions and variables as a «module» symbol', async () => {
    const code = `
export function add(a: number, b: number): number { return a + b; }
export const PI = 3.14;
type Callback = () => void;
export class Foo { x = 1; }
`;
    const model = await buildModel([{ file: 'src/utils.ts', content: code }]);
    const mod = model.symbols.find((s) => s.kind === 'module');
    expect(mod).toBeDefined();
    expect(mod!.name).toBe('utils');
    expect(mod!.members.some((m) => m.name === 'add' && m.kind === 'method')).toBe(true);
    expect(mod!.members.some((m) => m.name === 'PI' && m.kind === 'field')).toBe(true);
    expect(mod!.members.some((m) => m.name === 'Callback')).toBe(true);
    // class Foo must NOT land in the module symbol
    const foo = model.symbols.find((s) => s.name === 'Foo');
    expect(foo?.kind).toBe('class');
  });

  it('collects top-level Python functions and variables as a «module» symbol', async () => {
    const code = `
PI = 3.14
def add(a: int, b: int) -> int:
    return a + b

class Foo:
    pass
`;
    const model = await buildModel([{ file: 'utils.py', content: code }]);
    const mod = model.symbols.find((s) => s.kind === 'module');
    expect(mod).toBeDefined();
    expect(mod!.name).toBe('utils');
    expect(mod!.members.some((m) => m.name === 'add' && m.kind === 'method')).toBe(true);
    expect(mod!.members.some((m) => m.name === 'PI' && m.kind === 'field')).toBe(true);
    const foo = model.symbols.find((s) => s.name === 'Foo');
    expect(foo?.kind).toBe('class');
  });

  it('collects top-level C free functions as a «module» symbol', async () => {
    const code = `
typedef struct { int x; int y; } Point;
int add(int a, int b);
float distance(Point a, Point b);
int globalCounter;
`;
    const model = await buildModel([{ file: 'math.h', content: code }]);
    const mod = model.symbols.find((s) => s.kind === 'module');
    expect(mod).toBeDefined();
    expect(mod!.name).toBe('math');
    expect(mod!.members.some((m) => m.name === 'add' && m.kind === 'method')).toBe(true);
    expect(mod!.members.some((m) => m.name === 'distance' && m.kind === 'method')).toBe(true);
    expect(mod!.members.some((m) => m.name === 'globalCounter' && m.kind === 'field')).toBe(true);
    // Point struct must be its own symbol, NOT in module
    const point = model.symbols.find((s) => s.name === 'Point');
    expect(point?.kind).toBe('struct');
  });
});

describe('devtools Python pipeline', () => {
  it('marks @staticmethod and @classmethod as isStatic', async () => {
    const code = `
class MathUtils:
    _instance_count = 0

    @staticmethod
    def add(a: int, b: int) -> int:
        return a + b

    @classmethod
    def create(cls) -> 'MathUtils':
        return MathUtils()

    def reset(self) -> None:
        pass

    @property
    def value(self) -> int:
        return 0
`;
    const model = await buildModel([{ file: 'utils.py', content: code }]);
    const cls = model.symbols.find((s) => s.name === 'MathUtils')!;
    expect(cls).toBeDefined();
    const add = cls.members.find((m) => m.name === 'add');
    expect(add?.isStatic).toBe(true);
    expect(add?.text).toContain('static');
    const create = cls.members.find((m) => m.name === 'create');
    expect(create?.isStatic).toBe(true);
    expect(create?.text).toContain('static');
    const reset = cls.members.find((m) => m.name === 'reset');
    expect(reset?.isStatic).toBeFalsy();
    // @property is NOT static
    const value = cls.members.find((m) => m.name === 'value');
    expect(value).toBeDefined();
    expect(value?.isStatic).toBeFalsy();
  });
});
