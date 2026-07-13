import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/** DI token so the service depends on the abstraction, not a concrete provider. */
export const AIRTIME_PROVIDER = 'AIRTIME_PROVIDER';

export interface AirtimeSendInput {
  phoneNumber: string;
  amount: number;
  network: string;
}

export interface AirtimeSendResult {
  providerRef: string;
  status: 'delivered' | 'pending';
}

export interface AirtimeProvider {
  sendAirtime(input: AirtimeSendInput): Promise<AirtimeSendResult>;
}

/** South African mobile networks we support for airtime top-ups. */
export const SA_NETWORKS = [
  { code: 'VODACOM', label: 'Vodacom' },
  { code: 'MTN', label: 'MTN' },
  { code: 'CELLC', label: 'Cell C' },
  { code: 'TELKOM', label: 'Telkom' },
] as const;

export const SA_NETWORK_CODES: string[] = SA_NETWORKS.map((n) => n.code);

export function isSupportedNetwork(code: string): boolean {
  return SA_NETWORK_CODES.includes(String(code || '').toUpperCase());
}

/**
 * Default airtime provider backed by Reloadly (https://reloadly.com) — the
 * standard airtime/top-up API with SA operator coverage. Reads credentials from
 * the environment; if they're not set, it fails cleanly so the feature stays
 * dormant until you provision keys:
 *   RELOADLY_CLIENT_ID, RELOADLY_CLIENT_SECRET
 *   RELOADLY_ENV = "sandbox" | "live"   (default sandbox)
 *   RELOADLY_OPERATOR_<NETWORK>         (numeric Reloadly operatorId per network)
 */
@Injectable()
export class ReloadlyAirtimeProvider implements AirtimeProvider {
  private readonly logger = new Logger('ReloadlyAirtimeProvider');

  private get env() {
    return (process.env.RELOADLY_ENV || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
  }
  private get audience() {
    return this.env === 'live'
      ? 'https://topups.reloadly.com'
      : 'https://topups-sandbox.reloadly.com';
  }

  private async token(): Promise<string> {
    const clientId = process.env.RELOADLY_CLIENT_ID;
    const clientSecret = process.env.RELOADLY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Airtime provider is not configured.');
    }
    const res = await fetch('https://auth.reloadly.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        audience: this.audience,
      }),
    });
    if (!res.ok) throw new ServiceUnavailableException('Airtime auth failed.');
    const data: any = await res.json();
    return data.access_token;
  }

  private operatorId(network: string): string | undefined {
    return process.env[`RELOADLY_OPERATOR_${String(network).toUpperCase()}`];
  }

  async sendAirtime({ phoneNumber, amount, network }: AirtimeSendInput): Promise<AirtimeSendResult> {
    const operatorId = this.operatorId(network);
    if (!operatorId) {
      throw new ServiceUnavailableException(`No airtime operator configured for ${network}.`);
    }
    const token = await this.token();
    const res = await fetch(`${this.audience}/topups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/com.reloadly.topups-v1+json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        operatorId: Number(operatorId),
        amount,
        useLocalAmount: true,
        recipientPhone: { countryCode: 'ZA', number: phoneNumber },
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.warn(`Reloadly topup failed: ${res.status} ${JSON.stringify(data)}`);
      throw new ServiceUnavailableException(data?.message || 'Airtime top-up failed at the provider.');
    }
    return {
      providerRef: String(data.transactionId ?? data.id ?? ''),
      status: data.status === 'SUCCESSFUL' ? 'delivered' : 'pending',
    };
  }
}
