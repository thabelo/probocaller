import { BadRequestException } from '@nestjs/common';
import { isIsoCountryCode } from '../common/countries';
import { FicaDocType } from './entities/fica-document.entity';

/**
 * Personal FICA (KYC) document requirements for a jurisdiction.
 *
 * Deliberately a TWO-TIER system, not exhaustive per-country research like
 * src/kyb/kyb-country-config.ts: South Africa keeps today's tailored 4-doc
 * set (front+back ID, proof of address, selfie), and every other real
 * country gets one shared generic fallback (a single combined ID photo +
 * proof of address + selfie). We do not research per-country ID requirements
 * beyond this split.
 */
export interface FicaCountryDocConfig {
  countryCode: string;
  documents: { key: FicaDocType; label: string }[];
  tailored: boolean;
}

const PROOF_OF_ADDRESS_LABEL = 'Proof of address (utility bill, < 3 months)';
const SELFIE_LABEL = 'Selfie holding your ID';

/** South Africa keeps exactly today's 4-document requirement, unchanged. */
const ZA_CONFIG: FicaCountryDocConfig = {
  countryCode: 'ZA',
  tailored: true,
  documents: [
    { key: 'id_front', label: 'ID document — front' },
    { key: 'id_back', label: 'ID document — back' },
    { key: 'proof_of_address', label: PROOF_OF_ADDRESS_LABEL },
    { key: 'selfie', label: SELFIE_LABEL },
  ],
};

/** Every non-ZA country: one combined ID document instead of front+back. */
function genericConfig(countryCode: string): FicaCountryDocConfig {
  return {
    countryCode,
    tailored: false,
    documents: [
      { key: 'id_document', label: 'ID document (passport or national ID)' },
      { key: 'proof_of_address', label: PROOF_OF_ADDRESS_LABEL },
      { key: 'selfie', label: SELFIE_LABEL },
    ],
  };
}

/**
 * Resolves personal FICA requirements for a country. `undefined`/empty
 * defaults to 'ZA' so every existing caller that never passed a country
 * keeps today's exact behaviour. Throws only for a non-empty code that
 * fails ISO 3166-1 alpha-2 validation.
 */
export function getCountryFicaConfig(countryCode?: string): FicaCountryDocConfig {
  if (!countryCode || !countryCode.trim()) return ZA_CONFIG;

  const code = countryCode.trim().toUpperCase();
  if (!isIsoCountryCode(code)) {
    throw new BadRequestException(`Invalid country code "${countryCode}".`);
  }
  if (code === 'ZA') return ZA_CONFIG;
  return genericConfig(code);
}
