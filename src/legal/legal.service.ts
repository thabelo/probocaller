import { Injectable, NotFoundException } from '@nestjs/common';

export type LegalDocType = 'terms' | 'privacy';

export interface LegalDoc {
  type: LegalDocType;
  version: string;
  effectiveDate: string; // YYYY-MM-DD
  title: string;
  content: string;
}

export type LegalDocMeta = Omit<LegalDoc, 'content'>;

const TERMS_CONTENT = `# Probocaller Terms of Service

Effective date: 2026-06-01

## 1. Acceptance
By creating an account or using Probocaller you agree to these Terms. If you do
not agree, do not use the service.

## 2. The service
Probocaller identifies calls, screens spam, and lets verified businesses pay to
reach you. You may earn credits for answering monetised business calls. Earnings
and balances are shown in your wallet and are subject to verification (FICA) and
our withdrawal process.

## 3. Your account
You are responsible for activity on your account and for keeping your device
secure. You must provide accurate information and may not impersonate others.

## 4. Acceptable use
You may not use Probocaller to harass, defraud, or send spam, or to reverse the
service's spam protections. We may suspend accounts that abuse the platform.

## 5. Payments and withdrawals
Wallet credits have no cash value except as redeemable through our withdrawal
process to a verified bank account. We may reverse credits applied in error.

## 6. Termination
You may stop using the service at any time and delete your account. We may
suspend or terminate access for breach of these Terms.

## 7. Disclaimers and liability
The service is provided "as is". To the extent permitted by law we are not
liable for indirect or consequential losses arising from your use of the service.

## 8. Changes
We may update these Terms; material changes will be notified in-app and require
renewed acceptance. Continued use after the effective date constitutes acceptance.

## 9. Contact
Questions: support@probocaller.com`;

const PRIVACY_CONTENT = `# Probocaller Privacy Policy

Effective date: 2026-06-01

## 1. Who we are
Probocaller is the data controller for the personal information described here.

## 2. What we collect
- Account data: phone number, name, email.
- Call and SMS metadata used for caller ID, spam screening, and earnings.
- Profile data you choose to share with businesses.
- Device and usage data needed to operate the app.

## 3. How we use it
To provide caller ID and spam protection, to operate the pay-to-contact and
earnings features, to verify identity for withdrawals (FICA), and to keep the
platform safe. We process this data to perform our contract with you, to meet
legal obligations, and for our legitimate interest in preventing abuse.

## 4. Sharing
We share profile fields only with businesses you have granted access to, and
only the specific fields you opted into. We never sell your data. Service
providers (e.g. payment and infrastructure partners) process data on our behalf
under contract.

## 5. Your rights
You can access, export, correct, or delete your data. Use Settings → Privacy, or
the in-app data export, or contact us. You can withdraw consent for profile data
sharing at any time.

## 6. Retention
We keep personal data only as long as needed to provide the service and meet
legal obligations; old call and audit records are purged on a retention schedule.

## 7. Security
Data is encrypted in transit and access is restricted to your account and
authorised staff.

## 8. Changes and contact
We will notify material changes in-app. Contact: privacy@probocaller.com`;

const DOCS: Record<LegalDocType, LegalDoc> = {
  terms: {
    type: 'terms',
    version: '1.0.0',
    effectiveDate: '2026-06-01',
    title: 'Terms of Service',
    content: TERMS_CONTENT,
  },
  privacy: {
    type: 'privacy',
    version: '1.0.0',
    effectiveDate: '2026-06-01',
    title: 'Privacy Policy',
    content: PRIVACY_CONTENT,
  },
};

@Injectable()
export class LegalService {
  get(type: LegalDocType): LegalDoc {
    const doc = DOCS[type];
    if (!doc) throw new NotFoundException(`Unknown legal document: ${type}`);
    return doc;
  }

  list(): LegalDocMeta[] {
    return Object.values(DOCS).map(({ content, ...meta }) => meta);
  }

  currentVersion(type: LegalDocType): string {
    return this.get(type).version;
  }
}
