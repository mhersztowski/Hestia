import { platformToLanguage } from './types';

describe('platformToLanguage', () => {
  it('maps known platforms to their language', () => {
    expect(platformToLanguage('uPython')).toBe('MicroPython');
    expect(platformToLanguage('pygame')).toBe('Python');
    expect(platformToLanguage('Arduino')).toBe('C++');
    expect(platformToLanguage('PicoSdk')).toBe('C++');
  });

  it('passes an unknown platform through unchanged', () => {
    expect(platformToLanguage('Rust')).toBe('Rust');
  });
});
