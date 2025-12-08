// fbInsightsService.ts
import { fbGet } from './fbClient.js';

interface AdInsight {
  // ===== IDENTIFIERS =====
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  account_id?: string;
  account_name?: string;
  
  // ===== CAMPAIGN SETTINGS =====
  objective?: string;
  optimization_goal?: string;
  buying_type?: string;
  attribution_setting?: string;
  account_currency?: string;
  
  // ===== BASIC PERFORMANCE METRICS =====
  impressions: string;
  reach: string;
  frequency: string;
  clicks: string;
  unique_clicks: string;
  ctr: string;
  unique_ctr: string;
  cpc: string;
  cpm: string;
  cpp: string;
  
  // ===== SPEND & BUDGET =====
  spend: string;
  social_spend?: string;
  
  // ===== LINK CLICKS & CTR (Extended) =====
  inline_link_clicks?: string;
  outbound_clicks?: string;
  unique_outbound_clicks?: string;
  inline_link_click_ctr?: string;
  unique_inline_link_click_ctr?: string;
  cost_per_inline_link_click?: string;
  cost_per_unique_inline_link_click?: string;
  unique_link_clicks_ctr?: string;
  outbound_clicks_ctr?: string;
  unique_outbound_clicks_ctr?: string;
  cost_per_outbound_click?: string;
  cost_per_unique_outbound_click?: string;
  
  // ===== ENGAGEMENT METRICS =====
  inline_post_engagement?: string;
  cost_per_inline_post_engagement?: string;
  // Note: post_engagement, page_engagement, post_reactions, post_comments, post_shares, post_saves are in actions array
  
  // ===== QUALITY & DELIVERY METRICS =====
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
  // Note: delivery is not available as direct field
  
  // ===== VIDEO METRICS =====
  video_30_sec_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p50_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p75_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p100_watched_actions?: Array<{ action_type: string; value: string }>;
  video_avg_time_watched_actions?: Array<{ action_type: string; value: string }>;
  video_play_actions?: Array<{ action_type: string; value: string }>;
  video_continuous_2_sec_watched_actions?: Array<{ action_type: string; value: string }>;
  video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
  video_play_curve_actions?: Array<{ action_type: string; value: string }>;
  
  // ===== ACTIONS (includes landing_page_view, lead, purchase, etc.) =====
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  cost_per_unique_action_type?: Array<{ action_type: string; value: string }>;
  unique_actions?: Array<{ action_type: string; value: string }>;
  
  // ===== CONVERSIONS =====
  conversions?: Array<{ action_type: string; value: string }>;
  conversion_values?: Array<{ action_type: string; value: string }>;
  cost_per_conversion?: Array<{ action_type: string; value: string }>;
  converted_product_quantity?: Array<{ action_type: string; value: string }>;
  converted_product_value?: Array<{ action_type: string; value: string }>;
  
  // ===== WEBSITE & OFFSITE CONVERSION METRICS =====
  website_ctr?: Array<{ action_type: string; value: string }>;
  offsite_conversion?: Array<{ action_type: string; value: string }>;
  // Note: offsite_conversion_fb_pixel_custom is in offsite_conversion array
  
  // ===== MOBILE APP METRICS =====
  mobile_app_purchase_roas?: Array<{ action_type: string; value: string }>;
  website_purchase_roas?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  // Note: app_store_clicks and deeplink_clicks are in actions array
  
  // ===== CANVAS & INSTANT EXPERIENCE =====
  canvas_avg_view_percent?: string;
  canvas_avg_view_time?: string;
  instant_experience_clicks_to_open?: string;
  instant_experience_clicks_to_start?: string;
  instant_experience_outbound_clicks?: string;
  
  // ===== CATALOG & DYNAMIC ADS =====
  catalog_segment_actions?: Array<{ action_type: string; value: string }>;
  catalog_segment_value?: Array<{ action_type: string; value: string }>;
  catalog_segment_value_mobile_purchase_roas?: Array<{ action_type: string; value: string }>;
  catalog_segment_value_website_purchase_roas?: Array<{ action_type: string; value: string }>;
  
  // ===== COST METRICS =====
  cost_per_estimated_ad_recallers?: string;
  cost_per_thruplay?: Array<{ action_type: string; value: string }>;
  cost_per_2_sec_continuous_video_view?: Array<{ action_type: string; value: string }>;
  
  // ===== BRAND AWARENESS & REACH =====
  estimated_ad_recall_rate?: string;
  estimated_ad_recallers?: string;
  
  // ===== STORE TRAFFIC & LOCATION =====
  // Note: store_visit_actions and cost_per_store_visit_action are in actions/cost_per_action_type arrays
  
  // ===== FULL FUNNEL METRICS =====
  full_view_impressions?: string;
  full_view_reach?: string;
  
  // ===== DATE RANGE =====
  date_start: string;
  date_stop: string;
}

export async function getAdInsights({
  adAccountId,
  since,
  until,
  accessToken,
}: {
  adAccountId: string;
  since: string;
  until: string;
  accessToken: string;
}): Promise<AdInsight[]> {
  console.log(`[Insights] Fetching comprehensive ad insights for ${adAccountId} from ${since} to ${until}`);
  
  if (!adAccountId) {
    throw new Error('adAccountId is required');
  }
  if (!accessToken) {
    throw new Error('Meta access token is required');
  }

  const params = {
    level: 'ad',
    fields: [
      // ===== IDENTIFIERS =====
      'ad_id',
      'ad_name',
      'adset_id',
      'adset_name',
      'campaign_id',
      'campaign_name',
      
      // ===== CAMPAIGN SETTINGS =====
      'objective',
      'buying_type',
      
      // ===== BASIC PERFORMANCE =====
      'impressions',
      'reach',
      'frequency',
      'clicks',
      'unique_clicks',
      'ctr',
      'unique_ctr',
      'cpc',
      'cpm',
      'cpp',
      
      // ===== SPEND =====
      'spend',
      
      // ===== LINK CLICKS =====
      'inline_link_clicks',
      'outbound_clicks',
      'unique_outbound_clicks',
      'inline_link_click_ctr',
      'cost_per_inline_link_click',
      
      // ===== ENGAGEMENT =====
      'inline_post_engagement',
      
      // ===== QUALITY RANKING =====
      'quality_ranking',
      
      // ===== VIDEO METRICS =====
      'video_30_sec_watched_actions',
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p100_watched_actions',
      'video_avg_time_watched_actions',
      'video_play_actions',
      'video_thruplay_watched_actions',
      
      // ===== ACTIONS & CONVERSIONS (Most Important) =====
      'actions',
      'action_values',
      'cost_per_action_type',
      'conversions',
      'conversion_values',
      
      // ===== ROAS =====
      'purchase_roas',
      
      // ===== DATE RANGE =====
      'date_start',
      'date_stop',
    ].join(','),
    'time_range[since]': since,
    'time_range[until]': until,
    limit: 500,
  };

  const res = await fbGet(`/${adAccountId}/insights`, params, accessToken);
  const insights: AdInsight[] = res.data || [];
  console.log(`[Insights] Retrieved ${insights.length} comprehensive insight rows`);
  return insights;
}
