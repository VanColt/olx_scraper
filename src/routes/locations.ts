import { Router, Request, Response } from 'express';
import { resolveLocation } from '../services/olx';
import { sendError } from '../utils/errors';

const router = Router();

/**
 * @openapi
 * /olx/v1/locations/{name}:
 *   get:
 *     tags: [Locations]
 *     summary: Resolve a city or region name to OLX location ids
 *     description: >
 *       Turns a human name ("Kraków", "Łódź", "małopolskie") into the numeric
 *       ids used by the search city/region filters, with coordinates.
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: City or region name or slug
 *     responses:
 *       200:
 *         description: Resolved location (cityId, regionId, names, lat/lon)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LocationInfo'
 *       404:
 *         description: OLX doesn't know this location
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:name', async (req: Request, res: Response) => {
  try {
    const location = await resolveLocation(req.params.name);
    if (!location || (location.cityId === null && location.regionId === null)) {
      return res.status(404).json({ error: `Unknown location: ${req.params.name}` });
    }
    res.json(location);
  } catch (err) {
    sendError(res, err, 'location');
  }
});

export default router;
