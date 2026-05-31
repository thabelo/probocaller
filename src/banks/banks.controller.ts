import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { COUNTRIES, BANKS_BY_COUNTRY, Country, Bank } from './banks-data';

@ApiTags('banks')
@Controller('banks')
export class BanksController {
  /**
   * Static reference data — no auth needed.  Letting the country picker be
   * available pre-login keeps the bank-add UX snappy and avoids a token race.
   */

  @Get('countries')
  @ApiOperation({ summary: 'List all ISO 3166-1 alpha-2 countries' })
  @ApiQuery({ name: 'q', required: false, description: 'Substring filter on country name or code' })
  getCountries(@Query('q') q?: string): Country[] {
    if (!q) return COUNTRIES;
    const needle = q.trim().toLowerCase();
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.code.toLowerCase() === needle,
    );
  }

  @Get(':countryCode')
  @ApiOperation({
    summary: 'List banks for a given country code',
    description:
      'Returns the curated bank list for the country.  Always includes an "Other" sentinel so the UI can offer free-text entry.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Substring filter on bank name' })
  getBanks(@Param('countryCode') countryCode: string, @Query('q') q?: string): { country: Country | null; banks: Bank[] } {
    const code = countryCode.toUpperCase();
    const country = COUNTRIES.find((c) => c.code === code) ?? null;
    const banks = BANKS_BY_COUNTRY[code] ?? [];
    const otherSentinel: Bank = { key: 'other', name: 'Other bank — enter manually' };
    const withOther = [...banks, otherSentinel];

    const filtered = q
      ? withOther.filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()))
      : withOther;

    return { country, banks: filtered };
  }
}
