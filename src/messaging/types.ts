/**
 * Types for the OLX.pl Partner API v2 messaging endpoints.
 * Spec: https://developer.olx.pl/swagger/v2/partner_api.yaml
 *
 * Note the hard limitation: the Partner API can only REPLY to existing
 * threads. There is no endpoint to initiate first contact on a listing.
 */

export interface PartnerThread {
  id: number;
  advert_id: number;
  interlocutor_id: number;
  total_count: number;
  unread_count: number;
  created_at: string;
  is_favourite: boolean;
}

export interface PartnerMessageAttachment {
  url: string;
}

export interface PartnerMessage {
  id: number;
  thread_id: number;
  created_at: string;
  type: 'sent' | 'received';
  text: string;
  is_read: boolean;
  attachments: PartnerMessageAttachment[];
}

export interface PartnerClientConfig {
  /** OAuth2 access token with `v2 read write` scopes. */
  accessToken: string;
  /** Optional: enables automatic token refresh when provided together. */
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}
