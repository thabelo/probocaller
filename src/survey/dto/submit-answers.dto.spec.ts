import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitAnswersDto } from './submit-answers.dto';

const errorsFor = async (payload: unknown, options = {}) =>
  validate(plainToInstance(SubmitAnswersDto, payload as object), options);

describe('SubmitAnswersDto', () => {
  it('accepts a single-value answer', async () => {
    expect(await errorsFor({ answers: [{ questionId: 1, valueText: 'Because' }] })).toHaveLength(0);
  });

  /** Multi-select answers arrive as a list of chosen options. */
  it('accepts a multi-value answer', async () => {
    expect(await errorsFor({ answers: [{ questionId: 1, valueJson: ['a', 'b'] }] })).toHaveLength(0);
  });

  it('rejects an answer with no question', async () => {
    expect((await errorsFor({ answers: [{ valueText: 'x' }] })).length).toBeGreaterThan(0);
  });

  /**
   * The payout is the survey's frozen price, read server-side. A client that
   * could send an amount could pay itself.
   */
  it('refuses a client-supplied payout', async () => {
    const errors = await errorsFor(
      { answers: [{ questionId: 1, valueText: 'x' }], amountPaid: '9999' },
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((e) => e.property)).toContain('amountPaid');
  });
});
