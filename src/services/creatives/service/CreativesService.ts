import { fbGet } from '../../facebook/fbClient.js';
import { creativesRepository } from '../repository/CreativesRepository.js';
import { ICreative } from '../domain/creatives.domain.js';

export class CreativesService {

  /**
   * Fetch image URL from hash via Facebook API
   * Uses /adimages endpoint with hashes parameter
   */
  private async fetchImageUrlFromHash(
    imageHash: string,
    adAccountId: string,
    accessToken: string
  ): Promise<{ url: string | null; width: number | null; height: number | null }> {
    if (!imageHash) return { url: null, width: null, height: null };
    
    try {
      const accountId = adAccountId.replace('act_', '');
      
      // Use /adimages endpoint with hashes parameter
      const response = await fbGet(`/${accountId}/adimages`, {
        hashes: JSON.stringify([imageHash]),
        // Request all available fields including permalink_url (permanent URL)
        fields: 'id,account_id,hash,height,width,name,url,url_128,permalink_url,created_time,updated_time'
      }, accessToken);
      
      if (response?.data && Array.isArray(response.data)) {
        // Facebook always returns array format: { data: [{ hash: "...", url: "..." }] }
        const imageData = response.data.find((img: any) => img.hash === imageHash);
        
        if (imageData) {
          // Prefer permalink_url (permanent) over url (temporary)
          // Also check url_128 for higher resolution
          const imageUrl = imageData.permalink_url || imageData.url_128 || imageData.url || null;
          
          if (imageUrl) {
            return {
              url: imageUrl,
              width: imageData.width || null,
              height: imageData.height || null
            };
          }
        }
      } else if (response?.data) {
        console.warn(`[IMAGE HASH] Unexpected adimages response format for hash ${imageHash}:`, typeof response.data);
      }
      
      return { url: null, width: null, height: null };
      
    } catch (error: any) {
      console.error(`[IMAGE HASH] Error fetching image for hash ${imageHash}:`, error.message || error);
      return { url: null, width: null, height: null };
    }
  }

  /**
   * Detect if a creative is dynamic/template-based
   */
  private isDynamicCreative(creativeData: any): boolean {
    return !!(
      creativeData.asset_feed_spec != null ||
      creativeData.name?.includes('{{') ||
      creativeData.object_story_spec?.template_data != null
    );
  }

  /**
   * Fetch image URLs from multiple hashes in batch
   * Uses /adimages endpoint with hashes parameter (JSON array format)
   */
  private async fetchImageUrlsFromHashes(
    imageHashes: string[],
    adAccountId: string,
    accessToken: string
  ): Promise<Array<{ url: string; hash: string; width: number | null; height: number | null }>> {
    if (!imageHashes || imageHashes.length === 0) return [];

    try {
      const accountId = adAccountId.replace('act_', '');
      
      // Batch fetch via /adimages endpoint
      // hashes parameter: JSON.stringify creates ["hash1","hash2"] which Facebook accepts
      const response = await fbGet(`/${accountId}/adimages`, {
        hashes: JSON.stringify(imageHashes),
        // Include permalink_url for permanent URLs
        fields: 'hash,url,url_128,permalink_url,width,height'
      }, accessToken);

      const results: Array<{ url: string; hash: string; width: number | null; height: number | null }> = [];

      if (response?.data && Array.isArray(response.data)) {
        // Facebook always returns array format: { data: [{ hash: "...", url: "..." }] }
        const hashMap = new Map(imageHashes.map(h => [h, true]));
        
        for (const imageData of response.data) {
          if (imageData?.hash && hashMap.has(imageData.hash)) {
            // Prefer permalink_url (permanent) over url (temporary)
            // Also check url_128 for higher resolution
            const imageUrl = imageData.permalink_url || imageData.url_128 || imageData.url;
            
            if (imageUrl) {
              results.push({
                url: imageUrl,
                hash: imageData.hash,
                width: imageData.width || null,
                height: imageData.height || null
              });
            }
          }
        }
      } else if (response?.data) {
        console.warn(`[Creatives] Unexpected adimages response format:`, typeof response.data);
      }

      return results;
    } catch (error: any) {
      console.error(`[Creatives] Error batch fetching image URLs:`, error.message || error);
      // Fallback to individual fetches
      const results: Array<{ url: string; hash: string; width: number | null; height: number | null }> = [];
      for (const hash of imageHashes) {
        try {
          const imageData = await this.fetchImageUrlFromHash(hash, adAccountId, accessToken);
          if (imageData.url) {
            results.push({
              url: imageData.url,
              hash,
              width: imageData.width,
              height: imageData.height
            });
          }
        } catch (err: any) {
          console.error(`[Creatives] Failed to fetch image for hash ${hash}:`, err.message);
        }
      }
      return results;
    }
  }

  /**
   * Fetch creative details from Facebook API
   */
  private async fetchCreativeFromFacebook(
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
  private async fetchVideoDetails(
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
    
    // STEP 1: Check if this is a dynamic creative
    const isDynamic = this.isDynamicCreative(creativeData);
    
    // STEP 2: Normal type detection and enrichment
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
      
      // Extract all hashes from child_attachments first
      const carouselHashes = childAttachments
        .map((child: any) => child.imageHash)
        .filter(Boolean) as string[];
      
      if (carouselHashes.length > 0) {
        // Batch fetch all image URLs in one API call
        const imageUrls = await this.fetchImageUrlsFromHashes(carouselHashes, adAccountId, accessToken);
        
        // Build carouselImages array by matching fetched URLs to child_attachments
        const hashToUrlMap = new Map(imageUrls.map(img => [img.hash, img]));
        
        for (const child of childAttachments) {
          if (child.imageHash) {
            const imageData = hashToUrlMap.get(child.imageHash);
            if (imageData?.url) {
              carouselImages.push({
                url: imageData.url,
                hash: child.imageHash,
                name: child.name,
                description: child.description,
                link: child.link,
                width: imageData.width ?? undefined,
                height: imageData.height ?? undefined
              });
              console.log(`[Creatives] Carousel item ${carouselImages.length}: ${imageData.url}`);
            }
          }
        }
      }
      
      console.log(`[Creatives] Fetched ${carouselImages.length} carousel images`);
    }

    // Handle dynamic creative image hash resolution
    let dynamicImages: any[] = [];
    if (isDynamic) {
      // Check for asset_feed_spec.images first
      if (assetFeedSpec?.images?.length > 0 && !assetFeedSpec.products) {
        console.log(`[Creatives] Processing dynamic creative with asset_feed_spec.images...`);
        
        // First, check if images already have URLs in the response (no API call needed)
        const imagesWithUrls = assetFeedSpec.images
          .filter((img: any) => img.url && img.hash)
          .map((img: any) => ({
            url: img.url,
            hash: img.hash,
            width: img.width ?? undefined,
            height: img.height ?? undefined
          }));
        
        // Extract hashes that need fetching (no URL present in response)
        const hashesNeedingFetch = (assetFeedSpec.images || [])
          .filter((img: any) => img.hash && !img.url)
          .map((img: any) => String(img.hash))
          .filter((hash: string) => Boolean(hash)) as string[];
        
        const uniqueHashesNeedingFetch: string[] = [...new Set(hashesNeedingFetch)];
        
        console.log(`[Creatives] Found ${imagesWithUrls.length} images with URLs, ${uniqueHashesNeedingFetch.length} hashes need fetching`);
        
        // Fetch missing URLs via batch method
        if (uniqueHashesNeedingFetch.length > 0) {
          const fetchedUrls = await this.fetchImageUrlsFromHashes(uniqueHashesNeedingFetch, adAccountId, accessToken);
          dynamicImages = [
            ...imagesWithUrls,
            ...fetchedUrls.map(img => ({
              url: img.url,
              hash: img.hash,
              width: img.width ?? undefined,
              height: img.height ?? undefined
            }))
          ];
        } else {
          dynamicImages = imagesWithUrls;
        }
        
        console.log(`[Creatives] Total dynamic creative images: ${dynamicImages.length} (${imagesWithUrls.length} from response, ${dynamicImages.length - imagesWithUrls.length} fetched)`);
      }
      
      // Also check for top-level imageHash (fallback for dynamic creatives without asset_feed_spec.images)
      if (dynamicImages.length === 0 && creativeData.image_hash) {
        console.log(`[Creatives] Dynamic creative has top-level imageHash, fetching...`);
        try {
          const imageData = await this.fetchImageUrlFromHash(creativeData.image_hash, adAccountId, accessToken);
          if (imageData.url) {
            dynamicImages = [{
              url: imageData.url,
              hash: creativeData.image_hash,
              width: imageData.width ?? undefined,
              height: imageData.height ?? undefined
            }];
            console.log(`[Creatives] Fetched dynamic creative image from top-level imageHash`);
          }
        } catch (error: any) {
          console.error(`[Creatives] Failed to fetch image from top-level imageHash:`, error.message);
        }
      }
    }

    // Extract data from asset_feed_spec (Advantage+ Creative)
    let assetFeedData: any = null;
    if (Object.keys(assetFeedSpec).length > 0) {
      // Extract first image hash from asset_feed_spec (for imageHash field)
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
    // For dynamic creatives, use first hash from images array, otherwise use other sources
    const finalImageHash = isDynamic && dynamicImages.length > 0
      ? dynamicImages[0].hash
      : (creativeData.image_hash || photoData.image_hash || assetFeedData?.imageHash || null);

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
      images: isDynamic ? dynamicImages : carouselImages, // Use dynamic images if dynamic, else carousel
      videos,
      childAttachments,
      callToAction,
      creativeType: isDynamic ? 'dynamic' : creativeType,
      isDynamic: isDynamic,
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
  private async getCreatives(
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
   * Only fetches what's needed (video URL, carousel images, preview iframe, or full creative)
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
    const isDynamic = existing.isDynamic || false;
    console.log(`[Creatives] Creative type: ${creativeType}, isDynamic: ${isDynamic}`);

    try {
      // Handle dynamic creative image refresh
      if (isDynamic || creativeType === 'dynamic') {
        // Extract hashes from images[] array and refresh URLs
        const imageHashes = existing.images
          ?.map((img: any) => img.hash || img.imageHash)
          .filter(Boolean) || [];

        if (imageHashes.length > 0) {
          console.log(`[Creatives] Refreshing ${imageHashes.length} dynamic creative images...`);
          const imageUrls = await this.fetchImageUrlsFromHashes(imageHashes, adAccountId, accessToken);
          
          if (imageUrls.length > 0) {
            const updates: Partial<ICreative> = {
              images: imageUrls.map(img => ({
                url: img.url,
                hash: img.hash,
                width: img.width ?? undefined,
                height: img.height ?? undefined
              })),
              lastFetchedAt: new Date()
            };

            const updated = await creativesRepository.updateCreative(creativeId, updates);
            console.log(`[Creatives] Dynamic images refreshed: ${imageUrls.length}/${imageHashes.length}`);
            return updated;
          }
        }
        
        // If no hashes, do full fetch
        console.log(`[Creatives] No image hashes stored, doing full fetch`);
        return this.getCreative(creativeId, adAccountId, accessToken, true);
      }

      // At this point, creativeType is narrowed to 'image' | 'video' | 'carousel'
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
          // Lightweight refresh: only fetch carousel images from hashes stored in images[] array
          const imageHashes = existing.images
            ?.map((img: any) => img.hash || img.imageHash)
            .filter(Boolean) || [];

          if (imageHashes.length === 0) {
            console.log(`[Creatives] No image hashes stored, doing full fetch`);
            return this.getCreative(creativeId, adAccountId, accessToken, true);
          }

          console.log(`[Creatives] Refreshing ${imageHashes.length} carousel images`);
          const imageUrls = await this.fetchImageUrlsFromHashes(imageHashes, adAccountId, accessToken);

          if (imageUrls.length > 0) {
            // Preserve childAttachment metadata if available
            const carouselImages = imageUrls.map((img, i) => {
              const childAttachment = existing.childAttachments?.[i] || {};
              return {
                url: img.url,
                hash: img.hash,
                width: img.width ?? undefined,
                height: img.height ?? undefined,
                name: childAttachment.name || null,
                description: childAttachment.description || null,
                link: childAttachment.link || null
              };
            });

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
        default: {
          // Full refresh: image URLs come from creative endpoint
          // Note: 'dynamic' is handled above, this handles 'image' and any other types
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
