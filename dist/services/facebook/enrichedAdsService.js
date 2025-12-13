// enrichedAdsService.ts
import { getAdInsights } from './fbInsightsService.js';
import { getAdsWithCreatives, mapAdWithCreative } from './fbAdsService.js';
import { getLeadForms } from './fbLeadFormsService.js';
import { DateUtils } from '../../utils/date.utils.js';
export async function getEnrichedAds({ adAccountId, startDate, endDate, queryType, accessToken }) {
    console.log(`\n[Enriched Ads] Starting enrichment process for ${adAccountId} from ${startDate} to ${endDate} (${queryType})`);
    let _startDate = startDate;
    let _endDate = endDate;
    if (!accessToken) {
        throw new Error('Meta access token is required');
    }
    if (queryType === 'monthly' || queryType === 'yearly') {
        const adjustedStartDate = DateUtils.adjustStartDateForWeekBoundary(startDate, queryType);
        const adjustedEndDate = DateUtils.adjustEndDateForWeekBoundary(endDate, queryType);
        _startDate = adjustedStartDate;
        _endDate = adjustedEndDate;
        // return await getWeeklyMetaSpend(adAccountId, adjustedStartDate, adjustedEndDate, queryType, accessToken);
    }
    const insightsRows = await getAdInsights({ adAccountId, since: _startDate, until: _endDate, accessToken });
    if (!insightsRows.length) {
        return [];
    }
    const uniqueAdIds = Array.from(new Set(insightsRows.map(row => row.ad_id)));
    const adsMapRaw = await getAdsWithCreatives(uniqueAdIds, accessToken);
    const adEnrichedMap = {};
    const formIdsSet = new Set();
    for (const adId of uniqueAdIds) {
        const adObj = adsMapRaw[adId];
        if (!adObj)
            continue;
        const normalized = mapAdWithCreative(adObj);
        adEnrichedMap[adId] = normalized;
        if (normalized.lead_gen_form_id) {
            formIdsSet.add(normalized.lead_gen_form_id);
        }
    }
    const formMap = await getLeadForms(Array.from(formIdsSet), accessToken);
    const final = insightsRows.map(row => {
        const enriched = adEnrichedMap[row.ad_id] || {};
        const creative = enriched.creative || null;
        const formId = enriched.lead_gen_form_id || null;
        const form = formId ? formMap[formId] || null : null;
        const adConfigs = {
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
            adset_id: row.adset_id,
            adset_name: row.adset_name,
            ad_id: row.ad_id,
            ad_name: row.ad_name,
        };
        return {
            ...adConfigs,
            creative: creative,
            lead_form: form
                ? { id: form.id, name: form.name }
                : null,
            insights: {
                impressions: Number(row.impressions || 0),
                clicks: Number(row.clicks || 0),
                spend: Number(row.spend || 0),
                date_start: row.date_start,
                date_stop: row.date_stop,
            },
        };
    });
    return final;
}
/**
 * Get weekly aggregated Meta ad spend data (matching WeeklyActual pattern)
 * Returns array of weekly spend objects with startDate/endDate boundaries
 */
async function getWeeklyMetaSpend(adAccountId, startDate, endDate, queryType, accessToken) {
    console.log(`[Weekly Meta Spend] Calculating weeks for ${queryType} query: ${startDate} to ${endDate}`);
    if (!accessToken) {
        throw new Error('Meta access token is required');
    }
    // Get week boundaries using same logic as actuals
    const weeks = DateUtils.getMonthWeeks(startDate, endDate);
    console.log(`[Weekly Meta Spend] Found ${weeks.length} weeks`);
    // Fetch insights for each week and aggregate
    const weeklyResults = await Promise.all(weeks.map(async ({ weekStart, weekEnd }) => {
        console.log(`[Weekly Meta Spend] Fetching data for week: ${weekStart} to ${weekEnd}`);
        try {
            const insightsRows = await getAdInsights({
                adAccountId,
                since: weekStart,
                until: weekEnd,
                accessToken
            });
            // Aggregate spend, impressions, clicks for the week
            const weekTotal = insightsRows.reduce((acc, row) => ({
                spend: acc.spend + Number(row.spend || 0),
                impressions: acc.impressions + Number(row.impressions || 0),
                clicks: acc.clicks + Number(row.clicks || 0),
            }), { spend: 0, impressions: 0, clicks: 0 });
            return {
                startDate: weekStart,
                endDate: weekEnd,
                adAccountId,
                ...weekTotal
            };
        }
        catch (error) {
            console.error(`[Weekly Meta Spend] Error fetching week ${weekStart}:`, error);
            // Return zero-filled data for failed weeks
            return {
                startDate: weekStart,
                endDate: weekEnd,
                adAccountId,
                spend: 0,
                impressions: 0,
                clicks: 0,
            };
        }
    }));
    console.log(`[Weekly Meta Spend] Returning ${weeklyResults.length} weekly records\n`);
    return weeklyResults;
}
