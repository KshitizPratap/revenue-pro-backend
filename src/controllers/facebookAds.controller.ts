// facebookAds.controller.ts
import { Request, Response } from 'express';
import { getEnrichedAds } from '../services/facebook/enrichedAdsService.js';
import { getAllAdAccounts } from '../services/facebook/fbAdAccountsService.js';

export class FacebookAdsController {
  constructor() {
    this.getEnrichedAds = this.getEnrichedAds.bind(this);
    this.getAdAccounts = this.getAdAccounts.bind(this);
  }

  /**
   * Get enriched Facebook ads data with insights, creatives, and lead forms
   * GET /api/v1/facebook/enriched-ads?adAccountId=XXX&since=YYYY-MM-DD&until=YYYY-MM-DD
   */
  async getEnrichedAds(req: Request, res: Response): Promise<void> {
    console.log(`\n========================================`);
    console.log(`[API] Request received: GET /api/v1/facebook/enriched-ads`);
    console.log(`[API] Query params:`, req.query);
    console.log(`========================================\n`);
    
    try {
      const adAccountId = req.query.adAccountId as string;
      const since = req.query.since as string;
      const until = req.query.until as string;

      if (!adAccountId || !since || !until) {
        console.log('[API] Bad request: missing required parameters');
        res.status(400).json({ 
          success: false, 
          error: 'adAccountId, since, and until are required' 
        });
        return;
      }

      // Validate adAccountId format (numeric or act_XXXXX)
      if (!/^(act_)?\d+$/.test(adAccountId)) {
        console.log('[API] Bad request: invalid adAccountId format');
        res.status(400).json({ 
          success: false, 
          error: 'adAccountId must be numeric or in format act_XXXXX' 
        });
        return;
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(since) || !dateRegex.test(until)) {
        console.log('[API] Bad request: invalid date format');
        res.status(400).json({ 
          success: false, 
          error: 'Dates must be in YYYY-MM-DD format' 
        });
        return;
      }

      // Ensure adAccountId has act_ prefix
      const formattedAdAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

      const data = await getEnrichedAds({ adAccountId: formattedAdAccountId, since, until });

      console.log(`\n[API] Returning ${data.length} enriched records\n`);
      res.status(200).json({ 
        success: true, 
        data,
        count: data.length
      });
    } catch (err: any) {
      console.error('\n[API] Error in /api/v1/facebook/enriched-ads:', err.message);
      console.error('[API] Stack:', err.stack);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: err.message 
      });
    }
  }

  /**
   * Get all ad accounts from Business Manager (owned + client)
   * GET /api/v1/facebook/ad-accounts?businessId=XXXXX
   */
  async getAdAccounts(req: Request, res: Response): Promise<void> {
    console.log(`\n========================================`);
    console.log(`[API] Request received: GET /api/v1/facebook/ad-accounts`);
    console.log(`[API] Query params:`, req.query);
    console.log(`========================================\n`);
    
    try {
      const businessId = req.query.businessId as string;

      if (!businessId) {
        console.log('[API] Bad request: missing businessId');
        res.status(400).json({ 
          success: false, 
          error: 'businessId is required as query parameter' 
        });
        return;
      }

      // Validate businessId format (should be numeric)
      if (!/^\d+$/.test(businessId)) {
        console.log('[API] Bad request: invalid businessId format');
        res.status(400).json({ 
          success: false, 
          error: 'businessId must be numeric' 
        });
        return;
      }

      const data = await getAllAdAccounts(businessId);

      console.log(`\n[API] Returning ${data.total} ad accounts\n`);
      res.status(200).json({ 
        success: true, 
        data: {
          owned: data.owned,
          client: data.client,
          total: data.total,
        }
      });
    } catch (err: any) {
      console.error('\n[API] Error in /api/v1/facebook/ad-accounts:', err.message);
      console.error('[API] Stack:', err.stack);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: err.message 
      });
    }
  }
}
