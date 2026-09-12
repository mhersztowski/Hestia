import {
  setViewerUserId,
  readFileAt,
  readScene3dFile,
  CAD_EXT,
  SCENE_EXT,
  ELEC_EXT,
  MAP_EXT,
  NOTES_EXT,
} from './vfs';

const b64 = (s: string) => btoa(s);

function okJson(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('vfs file extensions', () => {
  it('exposes the expected extension constants', () => {
    expect(CAD_EXT).toBe('.cad.json');
    expect(SCENE_EXT).toBe('.scene.json');
    expect(ELEC_EXT).toBe('.elec.json');
    expect(MAP_EXT).toBe('.map.json');
    expect(NOTES_EXT).toBe('.notes.json');
  });
});

describe('readFileAt', () => {
  afterEach(() => vi.restoreAllMocks());

  it('decodes base64 content and builds a sanitized path query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ data: b64('hello world') }));
    vi.stubGlobal('fetch', fetchMock);

    const text = await readFileAt('/users/x/projects', 'my drawing', '.cad.json');
    expect(text).toBe('hello world');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/vfs/readFile');
    // spaces preserved but path separators/illegal chars replaced with _
    expect(url.searchParams.get('path')).toBe('/users/x/projects/my drawing.cad.json');
  });

  it('sanitizes illegal characters in the file name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ data: b64('x') }));
    vi.stubGlobal('fetch', fetchMock);
    await readFileAt('/d', 'a/b:c*?', '.cad.json');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('path')).toBe('/d/a_b_c__.cad.json');
  });

  it('throws with the server error message on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ error: 'nope' }, false, 404)));
    await expect(readFileAt('/d', 'f', '.cad.json')).rejects.toThrow('nope');
  });

  it('wraps network TypeErrors into a friendly backend-unreachable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed to fetch')));
    await expect(readFileAt('/d', 'f', '.cad.json')).rejects.toThrow(/CAD backend/);
  });
});

describe('readScene3dFile + setViewerUserId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setViewerUserId('default');
  });

  it('includes the configured viewer user id in the scene3d request', async () => {
    setViewerUserId('alice');
    const fetchMock = vi.fn().mockResolvedValue(okJson({ data: b64('scene') }));
    vi.stubGlobal('fetch', fetchMock);

    const text = await readScene3dFile('proj one', 'a.scene.json');
    expect(text).toBe('scene');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/scene3d/projects/proj%20one/a.scene.json');
    expect(url.searchParams.get('user')).toBe('alice');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Cad-User']).toBe('alice');
  });

  it('throws the server error on a failed scene3d fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ error: 'boom' }, false, 500)));
    await expect(readScene3dFile('p', 'f')).rejects.toThrow('boom');
  });
});
