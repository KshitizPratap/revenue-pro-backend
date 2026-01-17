import { creativesService } from '../services/creatives/service/CreativesService.js';
import { creativesRepository } from '../services/creatives/repository/CreativesRepository.js';
import UserService from '../services/user/service/service.js';
import { config } from '../config.js';
export class CreativesController {
    constructor() {
        this.userService = new UserService();
        this.fetchAndSaveCreatives = this.fetchAndSaveCreatives.bind(this);
        this.getCreative = this.getCreative.bind(this);
        this.getCreativesByAccount = this.getCreativesByAccount.bind(this);
        this.refreshCreative = this.refreshCreative.bind(this);
    }
    /**
     * Fetch and save creatives for all ads in a date range
     * POST /api/v1/creatives/fetch-and-save?clientId=XXX&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
     */
    async fetchAndSaveCreatives(req, res) {
        try {
            const clientId = req.query.clientId;
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;
            // Validate parameters
            if (!clientId || !startDate || !endDate) {
                res.status(400).json({
                    success: false,
                    error: 'clientId, startDate, and endDate are required',
                });
                return;
            }
            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
                res.status(400).json({
                    success: false,
                    error: 'Dates must be in YYYY-MM-DD format',
                });
                return;
            }
            // Get client user to resolve fbAdAccountId
            const clientUser = await this.userService.getUserById(clientId);
            if (!clientUser) {
                res.status(404).json({
                    success: false,
                    error: 'Client user not found',
                });
                return;
            }
            const fbAdAccountId = clientUser.fbAdAccountId;
            if (!fbAdAccountId) {
                res.status(400).json({
                    success: false,
                    error: 'Client does not have a configured Facebook Ad Account ID',
                });
                return;
            }
            // Use the same hardcoded Meta token owner as enriched-ads
            const metaTokenClientId = config.META_USER_TOKEN_ID;
            const metaTokenUser = await this.userService.getUserById(metaTokenClientId);
            const accessToken = metaTokenUser?.metaAccessToken;
            if (!accessToken) {
                res.status(500).json({
                    success: false,
                    error: 'Meta access token not configured for creatives fetch',
                });
                return;
            }
            // Fetch and save creatives
            const result = await creativesService.fetchAndSaveCreativesForClient(clientId, fbAdAccountId, accessToken, startDate, endDate);
            res.status(200).json({
                success: true,
                message: 'Creatives fetched and saved successfully',
                data: {
                    totalCreatives: result.creativeIds.length,
                    saved: result.saved,
                    failed: result.failed,
                    creativeIds: result.creativeIds,
                },
            });
        }
        catch (error) {
            console.error('[CreativesController] Error fetching creatives:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch and save creatives',
            });
        }
    }
    /**
     * Get a single creative by ID
     * GET /api/v1/creatives/:creativeId?clientId=XXX
     */
    async getCreative(req, res) {
        try {
            const creativeId = req.params.creativeId;
            const clientId = req.query.clientId;
            if (!creativeId) {
                res.status(400).json({
                    success: false,
                    error: 'creativeId is required',
                });
                return;
            }
            if (!clientId) {
                res.status(400).json({
                    success: false,
                    error: 'clientId is required',
                });
                return;
            }
            // Get client user to resolve fbAdAccountId and access token
            const clientUser = await this.userService.getUserById(clientId);
            if (!clientUser) {
                res.status(404).json({
                    success: false,
                    error: 'Client user not found',
                });
                return;
            }
            const fbAdAccountId = clientUser.fbAdAccountId;
            if (!fbAdAccountId) {
                res.status(400).json({
                    success: false,
                    error: 'Client does not have a configured Facebook Ad Account ID',
                });
                return;
            }
            // Use the same hardcoded Meta token owner as enriched-ads
            const metaTokenClientId = config.META_USER_TOKEN_ID;
            const metaTokenUser = await this.userService.getUserById(metaTokenClientId);
            const accessToken = metaTokenUser?.metaAccessToken;
            if (!accessToken) {
                res.status(500).json({
                    success: false,
                    error: 'Meta access token not configured for creative fetch',
                });
                return;
            }
            // Get creative (from cache or fetch from Facebook)
            const creative = await creativesService.getCreative(creativeId, fbAdAccountId, accessToken);
            if (!creative) {
                res.status(404).json({
                    success: false,
                    error: 'Creative not found',
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: creative,
            });
        }
        catch (error) {
            console.error('[CreativesController] Error getting creative:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get creative',
            });
        }
    }
    /**
     * Get all creatives for an ad account
     * GET /api/v1/creatives?clientId=XXX&limit=100
     */
    async getCreativesByAccount(req, res) {
        try {
            const clientId = req.query.clientId;
            const limit = parseInt(req.query.limit) || 100;
            if (!clientId) {
                res.status(400).json({
                    success: false,
                    error: 'clientId is required',
                });
                return;
            }
            // Get client user to resolve fbAdAccountId
            const clientUser = await this.userService.getUserById(clientId);
            if (!clientUser) {
                res.status(404).json({
                    success: false,
                    error: 'Client user not found',
                });
                return;
            }
            const fbAdAccountId = clientUser.fbAdAccountId;
            if (!fbAdAccountId) {
                res.status(400).json({
                    success: false,
                    error: 'Client does not have a configured Facebook Ad Account ID',
                });
                return;
            }
            // Get creatives from database
            const creatives = await creativesRepository.getCreativesByAdAccount(fbAdAccountId, limit);
            const totalCount = await creativesRepository.getCreativesCount(fbAdAccountId);
            res.status(200).json({
                success: true,
                data: creatives,
                meta: {
                    total: totalCount,
                    limit,
                    returned: creatives.length,
                },
            });
        }
        catch (error) {
            console.error('[CreativesController] Error getting creatives:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get creatives',
            });
        }
    }
    /**
     * Refresh a creative by fetching latest data from Facebook
     * Useful when image URLs expire or break in the frontend
     * POST /api/v1/creatives/:creativeId/refresh?clientId=XXX
     */
    async refreshCreative(req, res) {
        try {
            const creativeId = req.params.creativeId;
            const clientId = req.query.clientId;
            if (!creativeId) {
                res.status(400).json({
                    success: false,
                    error: 'creativeId is required',
                });
                return;
            }
            if (!clientId) {
                res.status(400).json({
                    success: false,
                    error: 'clientId is required',
                });
                return;
            }
            console.log(`[CreativesController] Refreshing creative ${creativeId} for client ${clientId}`);
            // Get client user to resolve fbAdAccountId
            const clientUser = await this.userService.getUserById(clientId);
            if (!clientUser) {
                res.status(404).json({
                    success: false,
                    error: 'Client user not found',
                });
                return;
            }
            const fbAdAccountId = clientUser.fbAdAccountId;
            if (!fbAdAccountId) {
                res.status(400).json({
                    success: false,
                    error: 'Client does not have a configured Facebook Ad Account ID',
                });
                return;
            }
            // Use the same hardcoded Meta token owner
            const metaTokenClientId = config.META_USER_TOKEN_ID;
            const metaTokenUser = await this.userService.getUserById(metaTokenClientId);
            const accessToken = metaTokenUser?.metaAccessToken;
            if (!accessToken) {
                res.status(500).json({
                    success: false,
                    error: 'Meta access token not configured for creative refresh',
                });
                return;
            }
            // Force refresh from Facebook (bypass cache)
            const creative = await creativesService.refreshCreativeUrls(creativeId, fbAdAccountId, accessToken);
            if (!creative) {
                res.status(404).json({
                    success: false,
                    error: 'Creative not found or failed to fetch from Facebook',
                });
                return;
            }
            console.log(`[CreativesController] Successfully refreshed creative ${creativeId}`);
            res.status(200).json({
                success: true,
                message: 'Creative refreshed successfully',
                data: creative,
            });
        }
        catch (error) {
            console.error('[CreativesController] Error refreshing creative:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to refresh creative',
            });
        }
    }
}
