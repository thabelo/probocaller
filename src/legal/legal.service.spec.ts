import { NotFoundException } from '@nestjs/common';
import { LegalService } from './legal.service';

describe('LegalService', () => {
  const service = new LegalService();

  it('returns the Terms of Service with version, effective date and content', () => {
    const doc = service.get('terms');
    expect(doc.type).toBe('terms');
    expect(doc.version).toMatch(/^\d+\.\d+/);
    expect(doc.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.title).toMatch(/terms/i);
    expect(doc.content.length).toBeGreaterThan(200);
  });

  it('returns the Privacy Policy', () => {
    const doc = service.get('privacy');
    expect(doc.type).toBe('privacy');
    expect(doc.title).toMatch(/privacy/i);
    expect(doc.content.length).toBeGreaterThan(200);
  });

  it('throws NotFound for an unknown document type', () => {
    expect(() => service.get('nonsense' as any)).toThrow(NotFoundException);
  });

  it('lists document metadata (version/effectiveDate) without the full content', () => {
    const list = service.list();
    expect(list.map((d) => d.type)).toEqual(expect.arrayContaining(['terms', 'privacy']));
    expect(list[0]).not.toHaveProperty('content');
    expect(list[0]).toHaveProperty('version');
  });

  it('exposes the current version of a document for consent tracking', () => {
    expect(service.currentVersion('terms')).toBe(service.get('terms').version);
  });
});
