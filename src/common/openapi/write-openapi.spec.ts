import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeOpenApi } from './write-openapi';

describe('writeOpenApi', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes the document as pretty JSON to the given path', () => {
    const out = path.join(dir, 'openapi.json');
    const doc = { openapi: '3.0.0', info: { title: 'x', version: '1' }, paths: {} };

    writeOpenApi(doc as any, out);

    const written = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(written).toEqual(doc);
    expect(fs.readFileSync(out, 'utf8')).toContain('\n  '); // pretty-printed
  });

  it('creates the parent directory if missing', () => {
    const out = path.join(dir, 'nested', 'deep', 'openapi.json');
    writeOpenApi({ openapi: '3.0.0' } as any, out);
    expect(fs.existsSync(out)).toBe(true);
  });
});
