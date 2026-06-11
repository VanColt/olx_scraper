import { Router, Request, Response } from 'express';
import { OlxPartnerClient } from '../messaging/partnerClient';

const router = Router();

const NOT_CONFIGURED = {
  error: 'Messaging is not configured',
  details:
    'Set OLX_PARTNER_ACCESS_TOKEN (OAuth2 token with "v2 read write" scopes from an approved app on developer.olx.pl). '
    + 'Note: the Partner API can only reply to existing threads, not initiate contact. See README — Messaging.',
};

function getClient(res: Response): OlxPartnerClient | null {
  const client = OlxPartnerClient.fromEnv();
  if (!client) res.status(501).json(NOT_CONFIGURED);
  return client;
}

/**
 * @openapi
 * /olx/v1/messaging/threads:
 *   get:
 *     tags: [Messaging]
 *     summary: List conversation threads (requires OLX Partner API access)
 *     description: >
 *       Requires OLX_PARTNER_ACCESS_TOKEN. The official Partner API can only
 *       reply to existing threads — it cannot initiate first contact.
 *     responses:
 *       200:
 *         description: Conversation threads
 *       501:
 *         description: Messaging not configured
 */
router.get('/threads', async (_req: Request, res: Response) => {
  const client = getClient(res);
  if (!client) return;
  try {
    res.json(await client.listThreads());
  } catch (err: any) {
    res.status(err.response?.status || 500).json({ error: 'Partner API request failed', details: err.message });
  }
});

/**
 * @openapi
 * /olx/v1/messaging/threads/{id}/messages:
 *   get:
 *     tags: [Messaging]
 *     summary: Read messages in a thread (requires OLX Partner API access)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Messages in the thread
 *       501:
 *         description: Messaging not configured
 */
router.get('/threads/:id/messages', async (req: Request, res: Response) => {
  const client = getClient(res);
  if (!client) return;
  try {
    res.json(await client.getMessages(Number(req.params.id)));
  } catch (err: any) {
    res.status(err.response?.status || 500).json({ error: 'Partner API request failed', details: err.message });
  }
});

/**
 * @openapi
 * /olx/v1/messaging/threads/{id}/messages:
 *   post:
 *     tags: [Messaging]
 *     summary: Reply in an existing thread (requires OLX Partner API access)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sent message
 *       501:
 *         description: Messaging not configured
 */
router.post('/threads/:id/messages', async (req: Request, res: Response) => {
  const client = getClient(res);
  if (!client) return;
  const text = req.body?.text;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Body must include a "text" string' });
  }
  try {
    res.json(await client.sendMessage(Number(req.params.id), text));
  } catch (err: any) {
    res.status(err.response?.status || 500).json({ error: 'Partner API request failed', details: err.message });
  }
});

export default router;
