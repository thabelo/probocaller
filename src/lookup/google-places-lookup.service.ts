import { Injectable } from '@nestjs/common';

/** Carrier / line-type / caller-name for a number, from an external provider. */
export interface NumberIntelligence {
  callerName?: string;
  carrierName?: string;
  lineType?: string;
}

/** Swappable number-intelligence provider (Google Places today; any vendor tomorrow). */
export interface NumberIntelligenceProvider {
  lookup(e164: string): Promise<NumberIntelligence | null>;
}

/** DI token so LookupService depends on the interface, not the concrete vendor. */
export const NUMBER_INTELLIGENCE = Symbol('NUMBER_INTELLIGENCE');

/**
 * Google Places "Find Place from phone number" fallback. Resolves a *business*
 * name for numbers we don't yet have in our own directory — so caller ID works
 * for businesses before we've built a user base. Unlike a CNAM provider this
 * returns no carrier/line-type and no private-individual names; it matches
 * public business listings only.
 *
 * Disabled (no-op → null) unless GOOGLE_MAPS_API_KEY is set, and always fails
 * safe (null) on any error so a vendor outage never breaks a lookup. The key
 * never touches the client — this runs server-side only.
 *
 * ToS note: Google Places content (the returned name) must NOT be persisted to
 * build our own directory — it may only be shown live at lookup time. Callers of
 * this service therefore display the name but never store it.
 */
@Injectable()
export class GooglePlacesLookupService implements NumberIntelligenceProvider {
  async lookup(e164: string): Promise<NumberIntelligence | null> {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return null;

    try {
      const url =
        'https://maps.googleapis.com/maps/api/place/findplacefromtext/json' +
        `?input=${encodeURIComponent(e164)}&inputtype=phonenumber` +
        `&fields=name,business_status&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data: any = await res.json();
      const candidate = data?.candidates?.[0];
      const name = candidate?.name || undefined;
      if (!name) return null;

      // A closed listing's name is unvetted (Places listings are publicly
      // editable, so a defunct/vandalized entry's text may be stale or
      // misleading) and the business itself can't be called back — showing it
      // as a live caller's identity is worse than showing nothing.
      if (candidate?.business_status === 'CLOSED_PERMANENTLY' || candidate?.business_status === 'CLOSED_TEMPORARILY') {
        return null;
      }

      return { callerName: name };
    } catch {
      return null;
    }
  }
}
