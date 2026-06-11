import axios, { AxiosInstance } from 'axios';
import {
  PartnerClientConfig,
  PartnerMessage,
  PartnerThread,
} from './types';

const PARTNER_BASE = 'https://www.olx.pl/api/partner';
const TOKEN_URL = 'https://www.olx.pl/api/open/oauth/token';

/**
 * Client for the official OLX.pl Partner API v2 messaging endpoints.
 *
 * Requires an app registered and approved on https://developer.olx.pl and an
 * OAuth2 access token with `v2 read write` scopes (see README — Messaging).
 *
 * EXPERIMENTAL: written against the published Swagger spec but not yet
 * exercised against a live token; expect to iterate once API access is
 * granted.
 */
export class OlxPartnerClient {
  private http: AxiosInstance;
  private config: PartnerClientConfig;

  constructor(config: PartnerClientConfig) {
    this.config = config;
    this.http = axios.create({
      baseURL: PARTNER_BASE,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        Version: '2.0',
      },
    });
  }

  static fromEnv(): OlxPartnerClient | null {
    const accessToken = process.env.OLX_PARTNER_ACCESS_TOKEN;
    if (!accessToken) return null;
    return new OlxPartnerClient({
      accessToken,
      clientId: process.env.OLX_CLIENT_ID,
      clientSecret: process.env.OLX_CLIENT_SECRET,
      refreshToken: process.env.OLX_PARTNER_REFRESH_TOKEN,
    });
  }

  async listThreads(params?: { advert_id?: number; interlocutor_id?: number; offset?: number; limit?: number }): Promise<PartnerThread[]> {
    const { data } = await this.http.get('/threads', { params });
    return data?.data ?? data;
  }

  async getThread(threadId: number): Promise<PartnerThread> {
    const { data } = await this.http.get(`/threads/${threadId}`);
    return data?.data ?? data;
  }

  async getMessages(threadId: number): Promise<PartnerMessage[]> {
    const { data } = await this.http.get(`/threads/${threadId}/messages`);
    return data?.data ?? data;
  }

  /** Reply in an existing thread. The Partner API cannot start new threads. */
  async sendMessage(threadId: number, text: string, attachments?: { url: string }[]): Promise<PartnerMessage> {
    const { data } = await this.http.post(`/threads/${threadId}/messages`, {
      text,
      ...(attachments?.length ? { attachments } : {}),
    });
    return data?.data ?? data;
  }

  async markAsRead(threadId: number): Promise<void> {
    await this.http.post(`/threads/${threadId}/commands`, { command: 'mark-as-read' });
  }

  /** Refresh the access token; requires clientId/clientSecret/refreshToken. */
  async refreshAccessToken(): Promise<string> {
    const { clientId, clientSecret, refreshToken } = this.config;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Token refresh requires OLX_CLIENT_ID, OLX_CLIENT_SECRET and OLX_PARTNER_REFRESH_TOKEN');
    }
    const { data } = await axios.post(TOKEN_URL, {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
    this.config.accessToken = data.access_token;
    this.http.defaults.headers.Authorization = `Bearer ${data.access_token}`;
    return data.access_token;
  }
}
