import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AdminUpdateDataBrokerDto } from './admin-data-broker.dto';

describe('AdminUpdateDataBrokerDto', () => {
  it('accepts valid data-broker controls', () => {
    const dto = plainToInstance(AdminUpdateDataBrokerDto, {
      dataShareEnabled: false,
      incognitoEnabled: true,
      dataCategories: ['age_range', 'income_range'],
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts an empty payload (all fields optional)', () => {
    const dto = plainToInstance(AdminUpdateDataBrokerDto, {});
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a non-boolean dataShareEnabled', () => {
    const dto = plainToInstance(AdminUpdateDataBrokerDto, { dataShareEnabled: 'yes' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects non-string category entries', () => {
    const dto = plainToInstance(AdminUpdateDataBrokerDto, { dataCategories: [1, 2] });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
