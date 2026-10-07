import { Injectable, Logger } from '@nestjs/common';

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

@Injectable()
export class FactusAuthService {
  private readonly logger = new Logger(FactusAuthService.name);
  private cachedToken?: string;
  private expiresAtMs = 0;

  private get baseUrl(): string {
    return process.env.FACTUS_BASE_URL || 'https://api-sandbox.factus.com.co';
  }

  /** Token fijo (opcional). Si no hay OAuth, se usa este valor. */
  private get staticToken(): string | undefined {
    return process.env.FACTUS_API_TOKEN?.trim() || undefined;
  }

  private get oauthConfigured(): boolean {
    return Boolean(
      process.env.FACTUS_CLIENT_ID?.trim() &&
        process.env.FACTUS_CLIENT_SECRET?.trim() &&
        process.env.FACTUS_USERNAME?.trim() &&
        process.env.FACTUS_PASSWORD,
    );
  }

  async getAccessToken(): Promise<string | undefined> {
    if (this.staticToken) {
      return this.staticToken;
    }
    if (!this.oauthConfigured) {
      return undefined;
    }
    const now = Date.now();
    if (this.cachedToken && now < this.expiresAtMs - 60_000) {
      return this.cachedToken;
    }

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: process.env.FACTUS_CLIENT_ID!.trim(),
      client_secret: process.env.FACTUS_CLIENT_SECRET!.trim(),
      username: process.env.FACTUS_USERNAME!.trim(),
      password: process.env.FACTUS_PASSWORD!,
    });

    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Factus OAuth fallo status=${response.status} body=${errorBody}`,
      );
      throw new Error('No fue posible autenticar con Factus');
    }

    const json = (await response.json()) as TokenResponse;
    this.cachedToken = json.access_token;
    this.expiresAtMs = now + (json.expires_in || 3600) * 1000;
    this.logger.log('Token Factus obtenido (OAuth v2)');
    return this.cachedToken;
  }
}
