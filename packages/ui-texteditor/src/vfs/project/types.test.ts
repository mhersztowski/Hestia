import { classifyLine } from './types';

describe('classifyLine', () => {
  it('classifies error lines', () => {
    expect(classifyLine('Compilation error: bad token')).toBe('error');
    expect(classifyLine('err: something')).toBe('error');
    expect(classifyLine('[error] boom')).toBe('error');
  });

  it('classifies warning lines', () => {
    expect(classifyLine('warning: deprecated')).toBe('warning');
    expect(classifyLine('warn: heads up')).toBe('warning');
    expect(classifyLine('[warn] careful')).toBe('warning');
  });

  it('classifies success lines', () => {
    expect(classifyLine('Build finished')).toBe('success');
    expect(classifyLine('all done')).toBe('success');
    expect(classifyLine('upload complete')).toBe('success');
  });

  it('classifies command lines by prefix', () => {
    expect(classifyLine('$ arduino-cli compile')).toBe('command');
    expect(classifyLine('> run')).toBe('command');
    expect(classifyLine('# comment')).toBe('command');
  });

  it('defaults to normal', () => {
    expect(classifyLine('just some output')).toBe('normal');
  });
});
