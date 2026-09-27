import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { AppConfig } from '../../config/app-config';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  hostedDomain: string | null;
  name: string;
  picture: string | null;
}

/** Google OpenID Connect — Authorization Code + PKCE ejecutado en el backend. */
@Injectable()
export class GoogleOidcService {
  constructor(private readonly config: AppConfig) {}

  private client(redirectUri: string): OAuth2Client {
    if (!this.config.google.configured) {
      throw new ServiceUnavailableException('Google OAuth no está configurado (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).');
    }
    return new OAuth2Client({
      clientId: this.config.google.clientId,
      clientSecret: this.config.google.clientSecret,
      redirectUri,
    });
  }

  async createAuthRequest(state: string, redirectUri: string, hostedDomain?: string): Promise<{ url: string; verifier: string }> {
    const client = this.client(redirectUri);
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const url = client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account',
      access_type: 'online',
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      // Sugerencia de dominio para el selector de cuentas; la validación real ocurre en el servidor.
      ...(hostedDomain ? { hd: hostedDomain } : {}),
    });
    return { url, verifier: codeVerifier };
  }

  async exchange(code: string, verifier: string, redirectUri: string): Promise<GoogleIdentity> {
    const client = this.client(redirectUri);
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    if (!tokens.id_token) throw new Error('Google no devolvió id_token');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: this.config.google.clientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) throw new Error('id_token sin sub/email');
    return {
      sub: p.sub,
      email: p.email.toLowerCase(),
      emailVerified: p.email_verified === true,
      hostedDomain: p.hd?.toLowerCase() ?? null,
      name: p.name ?? p.email,
      picture: p.picture ?? null,
    };
  }
}
