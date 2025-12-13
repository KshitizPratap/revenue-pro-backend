// fbInsightsService.ts
import { fbGet } from './fbClient.js';
export async function getAdInsights({ adAccountId, since, until, accessToken, }) {
    console.log(`[Insights] Fetching ad insights for ${adAccountId} from ${since} to ${until}`);
    if (!adAccountId) {
        throw new Error('adAccountId is required');
    }
    if (!accessToken) {
        throw new Error('Meta access token is required');
    }
    const params = {
        level: 'ad',
        fields: [
            'ad_id',
            'ad_name',
            'adset_id',
            'adset_name',
            'campaign_id',
            'campaign_name',
            'spend',
            'date_start',
            'date_stop',
        ].join(','),
        'time_range[since]': since,
        'time_range[until]': until,
        limit: 500,
    };
    const res = await fbGet(`/${adAccountId}/insights`, params, accessToken);
    const insights = res.data || [];
    console.log(`[Insights] Retrieved ${insights.length} insight rows`);
    return insights;
}
