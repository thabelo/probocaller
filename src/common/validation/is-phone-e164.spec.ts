import 'reflect-metadata';
import { validate } from 'class-validator';
import { IsPhoneE164 } from './is-phone-e164';

class Sample {
  @IsPhoneE164()
  phone!: any;
}

async function errorsFor(value: any) {
  const obj = new Sample();
  obj.phone = value;
  const errors = await validate(obj);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('IsPhoneE164', () => {
  it.each([
    '+27821234567',
    '+14155552671',
    '+861234567890',
    '+19',
  ])('accepts valid E.164 %p', async (input) => {
    expect(await errorsFor(input)).toEqual([]);
  });

  it.each([
    ['missing plus', '27821234567'],
    ['letters', '+27abc1234'],
    ['leading zero after plus', '+0123456'],
    ['too long', '+1234567890123456'],
    ['empty', ''],
    ['undefined', undefined],
    ['number type', 27821234567],
    ['spaces', '+27 82 123 4567'],
  ])('rejects %s (%p)', async (_label, input) => {
    const errors = await errorsFor(input);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/E\.164/);
  });
});
