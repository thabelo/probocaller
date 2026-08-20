import { BadRequestException } from '@nestjs/common';
import { assertPromptCollectsNoIdentity } from './prompt-screen';

const rejects = (prompt: string) => () => assertPromptCollectsNoIdentity(prompt);

describe('assertPromptCollectsNoIdentity', () => {
  describe('refuses a question that asks who someone is', () => {
    it.each([
      'What is your name?',
      'Please give your full name',
      'First name',
      'Surname',
      'Name:',
      'What is your ID number?',
      'Wat is jou ID nommer?',
      'Passport number',
      'What is your cell number?',
      'Mobile number please',
      'Best contact number to reach you on',
      'Whatsapp number',
      'What is your email?',
      'E-mail address',
      'What is your home address?',
      'Your physical address',
      'Please give your account number',
    ])('rejects %j', (prompt) => {
      expect(rejects(prompt)).toThrow(BadRequestException);
    });

    it('says why, and says it to the business rather than in jargon', () => {
      expect(rejects('What is your name?')).toThrow(/anonymous/i);
    });
  });

  /**
   * The cost of this screen is false rejections, and every one of them is a
   * business being told it may not ask something perfectly ordinary. These are
   * the phrasings that would be lost to a naive /name/ or /email/ match.
   */
  describe('allows an ordinary question that merely mentions the words', () => {
    it.each([
      'What is the name of the branch you visited?',
      'Which bank do you name as your primary?',
      'Do you prefer email or SMS for updates?',
      'How would you rate the service at our Sandton branch?',
      'Do you own a smartphone?',
      'Which brand name do you trust most?',
      'How many people live at your address?',
      'Was the account opening process clear?',
    ])('allows %j', (prompt) => {
      expect(rejects(prompt)).not.toThrow();
    });
  });

  it('ignores surrounding punctuation and casing', () => {
    expect(rejects('   YOUR NAME   ')).toThrow(BadRequestException);
  });

  it('allows an empty prompt, because that is a different rule', () => {
    expect(rejects('')).not.toThrow();
  });
});
