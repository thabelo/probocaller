import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { AddCreditDto } from './add-credit.dto';

/**
 * The wallet top-up amount is Rand-denominated, like every other touch of
 * this same wallet balance (airtime redemptions, call earnings). The Swagger
 * docs must say so — never "USD".
 */
describe('AddCreditDto — Swagger metadata', () => {
  it('describes the amount as ZAR, not USD', () => {
    const metadata = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, AddCreditDto.prototype, 'amount');
    expect(String(metadata.description)).toContain('ZAR');
    expect(String(metadata.description)).not.toContain('USD');
  });
});
