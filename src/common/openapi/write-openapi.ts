import * as fs from 'fs';
import * as path from 'path';
import { OpenAPIObject } from '@nestjs/swagger';

export function writeOpenApi(doc: OpenAPIObject, outPath: string): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
}
