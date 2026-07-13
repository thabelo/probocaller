import {
  getCountryKybConfig,
  getAllSupportedCountries,
  isIsoCountryCode,
} from './kyb-country-config';

describe('KYB country config — every country is supported', () => {
  describe('tailored jurisdictions', () => {
    it('returns the researched config for a configured country (ZA)', () => {
      const cfg = getCountryKybConfig('ZA');
      expect(cfg).toBeDefined();
      expect(cfg!.countryName).toBe('South Africa');
      expect(cfg!.registrationAuthority).toMatch(/CIPC/);
      expect(cfg!.documents.map((d) => d.key)).toContain('cipc_certificate');
      expect(cfg!.tailored).toBe(true);
    });

    it('is case-insensitive on the country code', () => {
      expect(getCountryKybConfig('za')!.countryCode).toBe('ZA');
    });
  });

  describe('generic fallback for real-but-unconfigured jurisdictions', () => {
    it('builds a jurisdiction-neutral config for Mozambique (MZ)', () => {
      const cfg = getCountryKybConfig('MZ');
      expect(cfg).toBeDefined();
      expect(cfg!.countryCode).toBe('MZ');
      expect(cfg!.countryName).toBe('Mozambique');
      expect(cfg!.tailored).toBe(false);

      // Universally applicable documents — no invented registry names.
      const docKeys = cfg!.documents.map((d) => d.key);
      expect(docKeys).toContain('registration_certificate');
      expect(docKeys).toContain('director_id');
      expect(docKeys).toContain('proof_of_address');

      // Universally applicable business info.
      const fieldKeys = cfg!.businessInfoFields.map((f) => f.key);
      expect(fieldKeys).toContain('legal_name');
      expect(fieldKeys).toContain('business_type');
      expect(fieldKeys).toContain('registration_number');
      expect(fieldKeys).toContain('registered_address');
    });

    it('marks required documents so a submission can actually be completed', () => {
      const cfg = getCountryKybConfig('MZ')!;
      const required = cfg.documents.filter((d) => d.required).map((d) => d.key);
      expect(required).toEqual(expect.arrayContaining(['registration_certificate', 'director_id']));
    });
  });

  describe('invalid country codes', () => {
    it('returns undefined for codes that are not ISO 3166-1 alpha-2', () => {
      expect(getCountryKybConfig('XX')).toBeUndefined();
      expect(getCountryKybConfig('ZZ')).toBeUndefined();
      expect(getCountryKybConfig('')).toBeUndefined();
    });

    it('isIsoCountryCode distinguishes real countries from bogus codes', () => {
      expect(isIsoCountryCode('BW')).toBe(true);
      expect(isIsoCountryCode('za')).toBe(true);
      expect(isIsoCountryCode('XX')).toBe(false);
    });
  });

  describe('newly tailored SADC jurisdictions', () => {
    it.each([
      ['BW', 'Botswana', 'BWP', /CIPA/],
      ['NA', 'Namibia', 'NAD', /BIPA/],
      ['ZM', 'Zambia', 'ZMW', /PACRA/],
      ['LS', 'Lesotho', 'LSL', /Registrar of Companies/],
      ['SZ', 'Eswatini', 'SZL', /Registrar of Companies/],
      ['MW', 'Malawi', 'MWK', /CRIPC/],
      ['AO', 'Angola', 'AOA', /Registo Comercial/],
      ['MG', 'Madagascar', 'MGA', /Registre du Commerce/],
      ['MU', 'Mauritius', 'MUR', /Corporate and Business Registration/],
      ['SC', 'Seychelles', 'SCR', /Financial Services Authority/],
      ['CD', 'DR Congo', 'CDF', /RCCM/],
    ])('%s (%s) has a researched config', (code, name, currency, authority) => {
      const cfg = getCountryKybConfig(code as string)!;
      expect(cfg.tailored).toBe(true);
      expect(cfg.countryName).toBe(name);
      expect(cfg.currency).toBe(currency);
      expect(cfg.registrationAuthority).toMatch(authority as RegExp);
      expect(cfg.documents.some((d) => d.required)).toBe(true);
      expect(cfg.businessInfoFields.some((f) => f.required)).toBe(true);
    });

    it('keeps low-confidence jurisdictions on the generic fallback rather than guessing', () => {
      // Research returned low confidence for these — we do not display an
      // unverified registrar name to a business.
      expect(getCountryKybConfig('MZ')!.tailored).toBe(false);
      expect(getCountryKybConfig('KM')!.tailored).toBe(false);
    });

    it('carries jurisdiction-specific required documents', () => {
      expect(getCountryKybConfig('MU')!.documents.find((d) => d.key === 'business_registration_card')?.required).toBe(true);
      expect(getCountryKybConfig('CD')!.documents.find((d) => d.key === 'id_nat')?.required).toBe(true);
      expect(getCountryKybConfig('MG')!.documents.find((d) => d.key === 'carte_identification_fiscale')?.required).toBe(true);
    });
  });

  describe('newly tailored EU / EEA jurisdictions', () => {
    it.each([
      ['CZ', 'Czechia', 'CZK', /Obchodní rejstřík/],
      ['SK', 'Slovakia', 'EUR', /Obchodný register/],
      ['HU', 'Hungary', 'HUF', /Cégjegyzék/],
      ['RO', 'Romania', 'RON', /ONRC|Registrului Comerțului/],
      ['BG', 'Bulgaria', 'EUR', /Commercial Register|Registry Agency/],
      ['GR', 'Greece', 'EUR', /GEMI|Γ\.Ε\.ΜΗ\./],
      ['HR', 'Croatia', 'EUR', /Sudski registar/],
      ['SI', 'Slovenia', 'EUR', /AJPES/],
      ['EE', 'Estonia', 'EUR', /Äriregister/],
      ['LV', 'Latvia', 'EUR', /Register of Enterprises/],
      ['LT', 'Lithuania', 'EUR', /Register of Legal Entities/],
      ['LU', 'Luxembourg', 'EUR', /Registre de Commerce/],
      ['MT', 'Malta', 'EUR', /Malta Business Registry/],
      ['CY', 'Cyprus', 'EUR', /Registrar of Companies/],
      ['IS', 'Iceland', 'ISK', /Fyrirtækjaskrá/],
      ['LI', 'Liechtenstein', 'CHF', /Handelsregister/],
    ])('%s (%s) has a researched config in %s', (code, name, currency, authority) => {
      const cfg = getCountryKybConfig(code as string)!;
      expect(cfg.tailored).toBe(true);
      expect(cfg.countryName).toBe(name);
      expect(cfg.currency).toBe(currency);
      expect(cfg.registrationAuthority).toMatch(authority as RegExp);
      expect(cfg.documents.some((d) => d.required)).toBe(true);
    });

    it("uses Greece's EL VAT prefix, not GR", () => {
      const vat = getCountryKybConfig('GR')!.businessInfoFields.find((f) => f.key === 'vat_number')!;
      expect(vat.placeholder).toMatch(/^EL/);
    });

    it('does not claim an EU VAT number for the non-VIES EEA states', () => {
      for (const code of ['IS', 'LI']) {
        const vat = getCountryKybConfig(code)!.businessInfoFields.find((f) => f.key === 'vat_number');
        // No fabricated EU-style example for countries outside VIES.
        expect(vat?.placeholder).toBeUndefined();
      }
    });
  });

  describe('getAllSupportedCountries', () => {
    it('lists every ISO country, flagging which have a tailored config', () => {
      const all = getAllSupportedCountries();
      expect(all.length).toBeGreaterThan(200);

      const za = all.find((c) => c.countryCode === 'ZA');
      const bw = all.find((c) => c.countryCode === 'BW');
      const mz = all.find((c) => c.countryCode === 'MZ');
      expect(za).toMatchObject({ countryName: 'South Africa', tailored: true });
      expect(bw).toMatchObject({ countryName: 'Botswana', tailored: true });
      expect(mz).toMatchObject({ countryName: 'Mozambique', tailored: false });
    });

    it('every listed country resolves to a usable config', () => {
      for (const c of getAllSupportedCountries()) {
        const cfg = getCountryKybConfig(c.countryCode);
        expect(cfg).toBeDefined();
        expect(cfg!.documents.some((d) => d.required)).toBe(true);
        expect(cfg!.businessInfoFields.some((f) => f.required)).toBe(true);
      }
    });
  });
});
