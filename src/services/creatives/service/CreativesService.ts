import { fbGet } from '../../facebook/fbClient.js';
import { creativesRepository } from '../repository/CreativesRepository.js';
import { ICreative } from '../domain/creatives.domain.js';

export class CreativesService {
  /**
   * Transform thumbnail URL to high-resolution URL by manipulating Facebook CDN parameters
   */
  private getHighResImageUrl(thumbnailUrl: string): string {
    if (!thumbnailUrl) return thumbnailUrl;
    
    // Facebook CDN URLs support size parameters
    // Transform to get higher resolution
      if (thumbnailUrl.includes('fbcdn.net')) {
        // Remove size restrictions from URL
        let highResUrl = thumbnailUrl
          .replace(/\/s\d+x\d+\//g, '/') // Remove size restrictions like /s320x320/
          .replace(/\/(p|cp)\d+x\d+\//g, '/') // Remove crop/profile sizes
          .replace(/_s\./, '_o.'); // Change _s (small) to _o (original)
        return highResUrl;
      }
      return thumbnailUrl;
  }

  /**
   * Fetch image URL from hash via Facebook API
   */
  private async fetchImageUrlFromHash(
    imageHash: string,
    adAccountId: string,
    accessToken: string
  ): Promise<{ url: string | null; width: number | null; height: number | null }> {
    if (!imageHash) return { url: null, width: null, height: null };
    
    try {
      const accountId = adAccountId.replace('act_', '');
      
      // Try Method 1: adimages endpoint with ALL fields
      try {
        const response = await fbGet(`/${accountId}/adimages`, {
          hashes: JSON.stringify([imageHash]),
          // Request ALL available fields
          fields: 'id,account_id,hash,height,width,name,url,url_128,permalink_url,created_time,updated_time'
        }, accessToken);
        
        console.log('[IMAGE HASH] Full response:', JSON.stringify(response, null, 2));
        
        if (response?.data) {
          let imageData = null;
          
          // Handle object format: { data: { hash: { url: "..." } } }
          if (typeof response.data === 'object' && !Array.isArray(response.data)) {
            imageData = response.data[imageHash];
          }
          // Handle array format: { data: [{ hash: "...", url: "..." }] }
          else if (Array.isArray(response.data)) {
            imageData = response.data.find((img: any) => img.hash === imageHash) || response.data[0];
          }
          
          if (imageData) {
            // Try all possible URL fields
            const possibleUrls = [
              imageData.url_128,  // Usually full-res despite name
              imageData.url,
              imageData.permalink_url
            ].filter(Boolean);
            
            
            if (possibleUrls.length > 0) {
              return {
                url: possibleUrls[0],
                width: imageData.width || null,
                height: imageData.height || null
              };
            }
          }
        }
      } catch (err: any) {
      }
      
      // Try Method 2: Direct hash lookup as endpoint
      try {
        const directResponse = await fbGet(`/${imageHash}`, {
          fields: 'url,url_128,permalink_url,height,width'
        }, accessToken);
        
        
        if (directResponse) {
          const url = directResponse.url_128 || directResponse.url || directResponse.permalink_url || null;
          if (url) {
            return {
              url,
              width: directResponse.width || null,
              height: directResponse.height || null
            };
          }
        }
      } catch (err: any) {
      }
      
      return { url: null, width: null, height: null };
      
    } catch (error: any) {
      console.error(`[IMAGE HASH] Fatal error:`, error);
      return { url: null, width: null, height: null };
    }
  }

  /**
   * Fetch creative details from Facebook API
   */
  async fetchCreativeFromFacebook(
    creativeId: string,
    accessToken: string
  ): Promise<any> {
    
    const fields = [
      'id',
      'name',
      'body',
      'title',
      'thumbnail_url',
      'image_url',
      'image_hash',
      'video_id',
      'call_to_action',
      'object_story_spec',
      'asset_feed_spec',
      'object_story_id',
      'effective_object_story_id',
      'effective_instagram_story_id'
    ].join(',');

    const creativeData = await fbGet(`/${creativeId}`, { fields }, accessToken);
    return creativeData;
  }

  /**
   * Fetch video details from Facebook API
   */
  async fetchVideoDetails(
    videoId: string,
    accessToken: string
  ): Promise<any> {
    try {
      const fields = 'source,picture,length,thumbnails.limit(1){uri,width,height,scale,is_preferred},permalink_url,embed_html';
      
      const videoData = await fbGet(`/${videoId}`, { fields }, accessToken);
      
      console.log(`[Creatives] Video API Response for ${videoId}:`, JSON.stringify({
        id: videoId,
        hasSource: !!videoData.source,
        sourceType: typeof videoData.source,
        sourcePreview: videoData.source ? videoData.source.substring(0, 100) + '...' : null,
        hasPicture: !!videoData.picture,
        hasPermalink: !!videoData.permalink_url,
        hasEmbedHtml: !!videoData.embed_html
      }, null, 2));
      
      // Get the highest quality thumbnail available
      let highQualityThumbnail = videoData.picture;
      if (videoData.thumbnails?.data?.length > 0) {
        // Sort thumbnails by scale/size and get the largest one
        const thumbnails = videoData.thumbnails.data;
        const largestThumbnail = thumbnails.reduce((prev: any, current: any) => {
          const prevScale = prev.scale || prev.width || 0;
          const currentScale = current.scale || current.width || 0;
          return currentScale > prevScale ? current : prev;
        });
        highQualityThumbnail = largestThumbnail.uri || highQualityThumbnail;
      }
      
      return {
        ...videoData,
        picture: highQualityThumbnail
      };
    } catch (error: any) {
      // Log but don't throw - allow creative to be saved without video details
      console.error(`[Creatives] Error fetching video ${videoId}:`, error.message || error);
      return null;
    }
  }

  /**
   * Fetch high-quality images from post using effective_object_story_id
   */
  async fetchPostAttachments(
    postId: string,
    accessToken: string
  ): Promise<{ imageUrl: string | null; thumbnailUrl: string | null }> {
    try {
      
      // Request EVERY possible image field
      const fields = [
        'attachments{media,media_type,subattachments,url,unshimmed_url,target{id}}',
        'full_picture',  // Highest quality available
        'picture',       // Standard quality
        'images'         // All available sizes
      ].join(',');
      
      const postData = await fbGet(`/${postId}`, { fields }, accessToken);
      
      
      // Priority 1: full_picture (highest quality)
      if (postData.full_picture) {
        return {
          imageUrl: postData.full_picture,
          thumbnailUrl: postData.full_picture
        };
      }
      
      // Priority 2: images array (select largest)
      if (postData.images && Array.isArray(postData.images)) {
        const largestImage = postData.images.reduce((largest: any, current: any) => {
          const largestSize = (largest.width || 0) * (largest.height || 0);
          const currentSize = (current.width || 0) * (current.height || 0);
          return currentSize > largestSize ? current : largest;
        });
        
        if (largestImage?.source) {
          return {
            imageUrl: largestImage.source,
            thumbnailUrl: largestImage.source
          };
        }
      }
      
      // Priority 3: attachments.media
      const attachments = postData?.attachments?.data?.[0];
      if (attachments?.media?.image?.src) {
        return {
          imageUrl: attachments.media.image.src,
          thumbnailUrl: attachments.media.image.src
        };
      }
      
      // Priority 4: Regular picture field
      if (postData.picture) {
        return {
          imageUrl: postData.picture,
          thumbnailUrl: postData.picture
        };
      }
      
      return { imageUrl: null, thumbnailUrl: null };
      
    } catch (error: any) {
      console.error(`[POST] Error:`, error.message);
      return { imageUrl: null, thumbnailUrl: null };
    }
  }

  /**
   * Parse and normalize creative data from Facebook API
   */
  private async parseCreativeData(
    creativeData: any, 
    adAccountId: string, 
    accessToken: string
  ): Promise<Partial<ICreative>> {
    console.log(`\n[Creatives] Processing creative ${creativeData.id}`);
    
    const oss = creativeData.object_story_spec || {};
    const linkData = oss.link_data || {};
    const photoData = oss.photo_data || {};
    const videoData = oss.video_data || {};
    const assetFeedSpec = creativeData.asset_feed_spec || {};
    
    // NEW SIMPLIFIED LOGIC
    // 1. Check for video_id (top level to determine type, but fetch using object_story_spec)
    const topLevelVideoId = creativeData.video_id || null;
    const videoId = videoData.video_id || topLevelVideoId || null; // Prefer object_story_spec for fetching
    
    // 2. Check for image_url (top level)
    const imageUrl = creativeData.image_url || null;
    
    // 3. Check for carousel (child_attachments with image_hash)
    const childAttachments = (linkData.child_attachments || []).map((child: any) => ({
      name: child.name || null,
      description: child.description || null,
      imageUrl: child.image_url || null,
      imageHash: child.image_hash || null,
      link: child.link || null,
      videoId: child.video_id || null
    }));
    
    const hasCarouselImages = childAttachments.some((child: any) => child.imageHash);
    
    // Determine creative type based on new logic
    let creativeType: 'image' | 'video' | 'carousel' | 'dynamic' = 'dynamic';
    
    // Check if video exists - either top-level OR in object_story_spec.video_data
    const hasVideo = !!(topLevelVideoId || videoId);
    
    if (hasVideo) {
      // Priority 1: Video (if video_id exists at any level - top-level or object_story_spec)
      creativeType = 'video';
      console.log(`[Creatives] Type: VIDEO (top-level video_id: ${topLevelVideoId || 'none'}, object_story_spec video_id: ${videoId || 'none'})`);
    } else if (imageUrl) {
      // Priority 2: Image (if image_url exists and no video_id)
      creativeType = 'image';
      console.log(`[Creatives] Type: IMAGE (image_url: ${imageUrl})`);
    } else if (!imageUrl && hasCarouselImages) {
      // Priority 3: Carousel (no image_url, no video_id, but has image hashes in child_attachments)
      creativeType = 'carousel';
      console.log(`[Creatives] Type: CAROUSEL (${childAttachments.length} items)`);
    } else {
      // Priority 4: Dynamic type based on what data exists
      if (assetFeedSpec && Object.keys(assetFeedSpec).length > 0) {
        creativeType = 'dynamic'; // Advantage+ or dynamic creative
        console.log(`[Creatives] Type: DYNAMIC (has asset_feed_spec)`);
      } else {
        creativeType = 'dynamic';
        console.log(`[Creatives] Type: DYNAMIC (no media found)`);
      }
    }

    // Fetch video details if video creative
    let videos: any[] = [];
    let finalImageUrl: string | null = null;
    let finalVideoUrl: string | null = null;
    
    if (videoId) {
      console.log(`[Creatives] Fetching video details for ${videoId}...`);
      const videoDetails = await this.fetchVideoDetails(videoId, accessToken);
      if (videoDetails) {
        const videoObject = {
          id: videoId,
          url: videoDetails.source || null,
          thumbnailUrl: videoDetails.picture || creativeData.thumbnail_url || null,
          duration: videoDetails.length || null
        };
        videos = [videoObject];
        finalVideoUrl = videoObject.url;
        console.log(`[Creatives] Video URL: ${videoObject.url}`);
        
        // Save thumbnail from video_data.image_url, fallback to video API picture
        if (videoData?.image_url) {
          finalImageUrl = videoData.image_url;
          console.log(`[Creatives] Video thumbnail from video_data: ${finalImageUrl}`);
        } else if (videoDetails.picture) {
          finalImageUrl = videoDetails.picture;
          console.log(`[Creatives] Video thumbnail from video API: ${finalImageUrl}`);
        } else if (creativeData.thumbnail_url) {
          finalImageUrl = creativeData.thumbnail_url;
          console.log(`[Creatives] Video thumbnail from top-level: ${finalImageUrl}`);
        }
      }
    }
    
    // For image type, use top-level image_url
    if (creativeType === 'image' && imageUrl) {
      finalImageUrl = imageUrl;
      console.log(`[Creatives] Image URL: ${finalImageUrl}`);
    }

    // Fetch carousel images from hashes
    let carouselImages: any[] = [];
    if (creativeType === 'carousel' && hasCarouselImages) {
      console.log(`[Creatives] Fetching carousel images from hashes...`);
      
      for (const child of childAttachments) {
        if (child.imageHash) {
          try {
            const imageData = await this.fetchImageUrlFromHash(child.imageHash, adAccountId, accessToken);
            if (imageData.url) {
              carouselImages.push({
                url: imageData.url,
                imageHash: child.imageHash,
                name: child.name,
                description: child.description,
                link: child.link,
                width: imageData.width,
                height: imageData.height
              });
              console.log(`[Creatives] Carousel item ${carouselImages.length}: ${imageData.url}`);
            }
          } catch (error: any) {
            console.error(`[Creatives] Failed to fetch carousel image for hash ${child.imageHash}:`, error.message);
          }
        }
      }
      
      console.log(`[Creatives] Fetched ${carouselImages.length} carousel images`);
    }

    // Extract data from asset_feed_spec (Advantage+ Creative)
    let assetFeedData: any = null;
    if (Object.keys(assetFeedSpec).length > 0) {
      // Extract first image hash from asset_feed_spec
      const assetImages = assetFeedSpec.images || [];
      const firstImageHash = assetImages[0]?.hash || null;
      
      // Extract first body text
      const assetBodies = assetFeedSpec.bodies || [];
      const firstBody = assetBodies[0]?.text || null;
      
      // Extract first title/headline
      const assetTitles = assetFeedSpec.titles || [];
      const firstTitle = assetTitles[0]?.text || null;
      
      // Extract first description
      const assetDescriptions = assetFeedSpec.descriptions || [];
      const firstDescription = assetDescriptions[0]?.text || null;
      
      // Extract call to action
      const assetCallToActions = assetFeedSpec.call_to_actions || [];
      const firstCta = assetCallToActions[0] || null;
      
      assetFeedData = {
        imageHash: firstImageHash,
        primaryText: firstBody,
        headline: firstTitle,
        description: firstDescription,
        callToAction: firstCta
      };
    }

    // Parse call to action - prioritize asset_feed_spec, then other sources
    const callToAction = assetFeedData?.callToAction || creativeData.call_to_action || linkData.call_to_action || videoData.call_to_action || null;

    // Simple image/thumbnail extraction
    const finalThumbnailUrl = creativeData.thumbnail_url || null;
    const finalImageHash = creativeData.image_hash || photoData.image_hash || assetFeedData?.imageHash || null;

    console.log(`[Creatives] Final data:`, {
      type: creativeType,
      imageUrl: finalImageUrl,
      videoUrl: finalVideoUrl,
      thumbnailUrl: finalThumbnailUrl,
      imageHash: finalImageHash,
      videoId: videoId,
      childAttachmentsCount: childAttachments.length
    });

    return {
      creativeId: creativeData.id,
      adAccountId,
      name: creativeData.name || null,
      primaryText: assetFeedData?.primaryText || creativeData.body || linkData.message || photoData.message || videoData.message || null,
      headline: assetFeedData?.headline || creativeData.title || linkData.name || null,
      description: assetFeedData?.description || linkData.description || null,
      body: assetFeedData?.primaryText || creativeData.body || null,
      thumbnailUrl: finalThumbnailUrl,
      imageUrl: finalImageUrl,
      imageHash: finalImageHash,
      videoId,
      images: carouselImages,
      videos,
      childAttachments,
      callToAction,
      creativeType,
      objectStorySpec: oss,
      rawData: creativeData,
      lastFetchedAt: new Date()
    };
  }

  /**
   * Get creative by ID (from DB or fetch from Facebook)
   */
  async getCreative(
    creativeId: string,
    adAccountId: string,
    accessToken: string,
    forceRefresh: boolean = false
  ): Promise<ICreative | null> {
    if (!creativeId) return null;

    // Check if creative exists in DB and is recent (< 7 days old)
    if (!forceRefresh) {
      const cached = await creativesRepository.getCreativeById(creativeId);
      if (cached && cached.lastFetchedAt) {
        const daysSinceUpdate = (Date.now() - new Date(cached.lastFetchedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate < 7) {
          console.log(`[Creatives] Using cached creative ${creativeId}`);
          return cached;
        }
      }
    }

    // Fetch from Facebook API
    try {
      const creativeData = await this.fetchCreativeFromFacebook(creativeId, accessToken);
      const parsedCreative = await this.parseCreativeData(creativeData, adAccountId, accessToken);

      // Save to database
      const updated = await creativesRepository.upsertCreative(parsedCreative);

      console.log(`[Creatives] Cached creative ${creativeId}`);
      return updated;
    } catch (error: any) {
      console.error(`[Creatives] Error fetching creative ${creativeId}:`, error.message || error);
      
      // Return cached version if available (even if stale)
      const cached = await creativesRepository.getCreativeById(creativeId);
      return cached || null;
    }
  }

  /**
   * Batch get creatives
   */
  async getCreatives(
    creativeIds: string[],
    adAccountId: string,
    accessToken: string
  ): Promise<Record<string, ICreative>> {
    if (!creativeIds || creativeIds.length === 0) return {};

    const uniqueIds = Array.from(new Set(creativeIds.filter(id => id)));
    console.log(`[Creatives] Fetching ${uniqueIds.length} creatives`);

    // Get cached creatives
    const cached = await creativesRepository.getCreativesByIds(uniqueIds);
    const cachedMap: Record<string, ICreative> = {};
    const now = Date.now();
    
    cached.forEach(c => {
      const daysSinceUpdate = (now - new Date(c.lastFetchedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 7) {
        cachedMap[c.creativeId] = c;
      }
    });

    // Determine which creatives need to be fetched
    const toFetch = uniqueIds.filter(id => !cachedMap[id]);

    if (toFetch.length === 0) {
      console.log(`[Creatives] All ${uniqueIds.length} creatives cached`);
      return cachedMap;
    }

    console.log(`[Creatives] Need to fetch ${toFetch.length} creatives from Facebook`);

    // Fetch missing creatives in parallel (limit concurrency to avoid rate limits)
    const BATCH_SIZE = 10;
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      
      await Promise.all(
        batch.map(async (creativeId) => {
          try {
            const creative = await this.getCreative(creativeId, adAccountId, accessToken, true);
            if (creative) {
              cachedMap[creativeId] = creative;
            }
          } catch (error: any) {
            console.error(`[Creatives] Failed to fetch creative ${creativeId}:`, error.message || error);
          }
        })
      );
    }

    console.log(`[Creatives] Total creatives available: ${Object.keys(cachedMap).length}`);
    return cachedMap;
  }

  /**
   * Smart refresh creative URLs from Facebook based on type
   * Only fetches what's needed (video URL, carousel images, or full creative)
   */
  async refreshCreativeUrls(
    creativeId: string,
    adAccountId: string,
    accessToken: string
  ): Promise<ICreative | null> {
    console.log(`[Creatives] Smart refresh for creative ${creativeId}`);

    // Get existing creative from DB to determine strategy
    const existing = await creativesRepository.getCreativeById(creativeId);
    if (!existing) {
      console.log(`[Creatives] Creative ${creativeId} not in DB, doing full fetch`);
      return this.getCreative(creativeId, adAccountId, accessToken, true);
    }

    const creativeType = existing.creativeType;
    console.log(`[Creatives] Creative type: ${creativeType}`);

    try {
      switch (creativeType) {
        case 'video': {
          // Lightweight refresh: only fetch video URL from video_id
          if (!existing.videoId) {
            console.log(`[Creatives] No videoId stored, doing full fetch`);
            return this.getCreative(creativeId, adAccountId, accessToken, true);
          }

          console.log(`[Creatives] Refreshing video URL for video_id: ${existing.videoId}`);
          const videoDetails = await this.fetchVideoDetails(existing.videoId, accessToken);
          
          if (videoDetails) {
            // Update video URL and thumbnail
            const updatedVideos = [{
              id: existing.videoId,
              url: videoDetails.source || null,
              thumbnailUrl: videoDetails.picture || null,
              duration: videoDetails.length || null
            }];

            const updates: Partial<ICreative> = {
              videos: updatedVideos,
              imageUrl: videoDetails.picture || existing.imageUrl, // Update thumbnail
              lastFetchedAt: new Date()
            };

            const updated = await creativesRepository.updateCreative(creativeId, updates);
            console.log(`[Creatives] Video URL refreshed successfully`);
            return updated;
          }
          break;
        }

        case 'carousel': {
          // Lightweight refresh: only fetch carousel images from hashes
          const imageHashes = existing.childAttachments
            ?.map((child: any) => child.imageHash)
            .filter(Boolean) || [];

          if (imageHashes.length === 0) {
            console.log(`[Creatives] No image hashes stored, doing full fetch`);
            return this.getCreative(creativeId, adAccountId, accessToken, true);
          }

          console.log(`[Creatives] Refreshing ${imageHashes.length} carousel images`);
          const carouselImages: any[] = [];

          for (let i = 0; i < imageHashes.length; i++) {
            const hash = imageHashes[i];
            try {
              const imageData = await this.fetchImageUrlFromHash(hash, adAccountId, accessToken);
              if (imageData.url) {
                const childAttachment = existing.childAttachments?.[i] || {};
                carouselImages.push({
                  url: imageData.url,
                  imageHash: hash,
                  name: childAttachment.name || null,
                  description: childAttachment.description || null,
                  link: childAttachment.link || null,
                  width: imageData.width,
                  height: imageData.height
                });
                console.log(`[Creatives] Carousel image ${i + 1} refreshed`);
              }
            } catch (error: any) {
              console.error(`[Creatives] Failed to refresh carousel image ${i + 1}:`, error.message);
            }
          }

          if (carouselImages.length > 0) {
            const updates: Partial<ICreative> = {
              images: carouselImages,
              lastFetchedAt: new Date()
            };

            const updated = await creativesRepository.updateCreative(creativeId, updates);
            console.log(`[Creatives] Carousel images refreshed: ${carouselImages.length}/${imageHashes.length}`);
            return updated;
          }
          break;
        }

        case 'image':
        case 'dynamic':
        default: {
          // Full refresh: image URLs come from creative endpoint
          console.log(`[Creatives] Doing full fetch for type: ${creativeType}`);
          return this.getCreative(creativeId, adAccountId, accessToken, true);
        }
      }

      // Fallback to full fetch if lightweight refresh failed
      console.log(`[Creatives] Lightweight refresh failed, doing full fetch`);
      return this.getCreative(creativeId, adAccountId, accessToken, true);

    } catch (error: any) {
      console.error(`[Creatives] Error in smart refresh:`, error.message);
      // Fallback to full fetch on error
      return this.getCreative(creativeId, adAccountId, accessToken, true);
    }
  }

  /**
   * Fetch and save all creatives for ads in a date range
   */
  async fetchAndSaveCreativesForClient(
    clientId: string,
    adAccountId: string,
    accessToken: string,
    startDate: string,
    endDate: string
  ): Promise<{ saved: number; failed: number; creativeIds: string[] }> {
    console.log(`[Creatives] Fetching creatives for client ${clientId} from ${startDate} to ${endDate}`);

    // Import fbWeeklyAnalytics repository to get creative IDs
    const { fbWeeklyAnalyticsRepository } = await import('../../facebook/repository/FbWeeklyAnalyticsRepository.js');
    
    // Get all analytics for the date range
    const analytics = await fbWeeklyAnalyticsRepository.getAnalyticsByDateRange(
      clientId,
      startDate,
      endDate
    );

    // Extract unique creative IDs
    const creativeIds = Array.from(new Set(
      analytics
        .map(a => a.creative?.id)
        .filter((id): id is string => !!id)
    ));

    console.log(`[Creatives] Found ${creativeIds.length} unique creatives to fetch`);

    if (creativeIds.length === 0) {
      return { saved: 0, failed: 0, creativeIds: [] };
    }

    // Fetch and save all creatives
    let saved = 0;
    let failed = 0;

    const BATCH_SIZE = 10;
    for (let i = 0; i < creativeIds.length; i += BATCH_SIZE) {
      const batch = creativeIds.slice(i, i + BATCH_SIZE);
      console.log(`[Creatives] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(creativeIds.length / BATCH_SIZE)}`);
      
      await Promise.all(
        batch.map(async (creativeId) => {
          try {
            await this.getCreative(creativeId, adAccountId, accessToken, true);
            saved++;
          } catch (error: any) {
            console.error(`[Creatives] Failed to fetch creative ${creativeId}:`, error.message || error);
            failed++;
          }
        })
      );
    }

    console.log(`[Creatives] Completed: ${saved} saved, ${failed} failed`);
    return { saved, failed, creativeIds };
  }
}

export const creativesService = new CreativesService();
