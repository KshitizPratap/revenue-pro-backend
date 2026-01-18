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
   * Determine creative mode (how the creative is assembled)
   * Logic from instructions.txt
   * STATIC = single image OR single video (not carousel, not dynamic)
   */
  private determineCreativeMode(creativeData: any): 'STATIC' | 'STATIC_CAROUSEL' | 'DYNAMIC_ASSET_FEED' | 'DYNAMIC_CATALOG' {
    const linkData = creativeData.object_story_spec?.link_data || {};
    const assetFeedSpec = creativeData.asset_feed_spec || {};
    
    // Check for carousel (child_attachments with length > 1)
    if (linkData.child_attachments && linkData.child_attachments.length > 1) {
      return 'STATIC_CAROUSEL';
    }
    
    // Check for dynamic catalog (product-based)
    if (assetFeedSpec.products) {
      return 'DYNAMIC_CATALOG';
    }
    
    // Check for dynamic asset feed (images or videos in asset_feed_spec)
    if (assetFeedSpec.images || assetFeedSpec.videos) {
      return 'DYNAMIC_ASSET_FEED';
    }
    
    // STATIC: single image (image_url at root) OR single video (video_id in object_story_spec.video_data or top-level)
    // This covers both image and video creatives that are not carousel or dynamic
    return 'STATIC';
  }

  /**
   * Determine media type (what media it uses)
   * Logic from instructions.txt
   */
  private determineMediaType(
    creativeData: any,
    creativeMode: 'STATIC' | 'STATIC_CAROUSEL' | 'DYNAMIC_ASSET_FEED' | 'DYNAMIC_CATALOG'
  ): 'IMAGE' | 'VIDEO' | 'MIXED' {
    const assetFeedSpec = creativeData.asset_feed_spec || {};
    const linkData = creativeData.object_story_spec?.link_data || {};
    const videoData = creativeData.object_story_spec?.video_data || {};
    
    // Check for images
    const hasImages = !!(
      creativeData.image_url ||
      (assetFeedSpec.images && assetFeedSpec.images.length > 0) ||
      (linkData.child_attachments && linkData.child_attachments.some((child: any) => child.image_hash))
    );
    
    // Check for videos
    const hasVideos = !!(
      creativeData.video_id ||
      videoData.video_id ||
      (assetFeedSpec.videos && assetFeedSpec.videos.length > 0) ||
      (linkData.child_attachments && linkData.child_attachments.some((child: any) => child.video_id))
    );
        
    if (hasImages && hasVideos) {
      return 'MIXED';
    } else if (hasVideos) {
      return 'VIDEO';
    } else {
      return 'IMAGE';
        }
      }
      
  /**
   * Fetch video preview iframe for videos with permission errors
   * Fallback when video source cannot be accessed
   */
  private async fetchVideoPreviewIframe(
    creativeId: string,
    accessToken: string
  ): Promise<string | null> {
    try {
      const response = await fbGet(`/${creativeId}/previews`, {
        ad_format: 'DESKTOP_FEED_STANDARD'
      }, accessToken);
      
      if (response?.data && Array.isArray(response.data) && response.data.length > 0) {
        const previewBody = response.data[0]?.body;
        if (previewBody && typeof previewBody === 'string') {
          console.log(`[Creatives] Fetched preview iframe for creative ${creativeId}`);
          return previewBody;
        }
      }
      
      return null;
    } catch (error: any) {
      console.error(`[Creatives] Error fetching preview iframe for creative ${creativeId}:`, error.message);
      return null;
    }
  }

  /**
   * Enrich video media - fetches video URL with fallback to preview iframe
   */
  private async enrichVideoMedia(
    videoId: string,
    creativeId: string,
    accessToken: string
  ): Promise<{
    videos: Array<{ id: string; url: string | null; thumbnailUrl: string | null; duration?: number }>;
    videoUrls: string[];
    videoIds: string[];
    previewIframes: string[];
    thumbnailUrl: string | null;
  }> {
    const result = {
      videos: [] as Array<{ id: string; url: string | null; thumbnailUrl: string | null; duration?: number }>,
      videoUrls: [] as string[],
      videoIds: [videoId],
      previewIframes: [] as string[],
      thumbnailUrl: null as string | null
    };

    try {
      console.log(`[Creatives] Fetching video details for ${videoId}...`);
      const videoDetails = await this.fetchVideoDetails(videoId, accessToken);
    
      if (videoDetails && videoDetails.source) {
        // Successfully got video URL
        result.videos.push({
          id: videoId,
          url: videoDetails.source,
          thumbnailUrl: videoDetails.picture || null,
          duration: videoDetails.length || undefined
        });
        result.videoUrls.push(videoDetails.source);
        result.thumbnailUrl = videoDetails.picture || null;
        console.log(`[Creatives] Video URL fetched: ${videoDetails.source}`);
    } else {
        // No source URL, try preview iframe fallback
        console.log(`[Creatives] No video source URL, trying preview iframe...`);
        const previewIframe = await this.fetchVideoPreviewIframe(creativeId, accessToken);
        if (previewIframe) {
          result.previewIframes.push(previewIframe);
          console.log(`[Creatives] Using preview iframe for video ${videoId}`);
        }
      }
    } catch (error: any) {
      // Check if it's a permission error (#10)
      if (error.code === 10 || error.error?.code === 10 || error.message?.includes('permission')) {
        console.log(`[Creatives] Permission error (#10) for video ${videoId}, trying preview iframe...`);
        const previewIframe = await this.fetchVideoPreviewIframe(creativeId, accessToken);
        if (previewIframe) {
          result.previewIframes.push(previewIframe);
          console.log(`[Creatives] Using preview iframe fallback for video ${videoId}`);
        }
      } else {
        console.error(`[Creatives] Error fetching video ${videoId}:`, error.message);
      }
    }

    return result;
  }

  /**
   * Enrich single image media
   */
  private async enrichImageMedia(
    imageUrl: string | null,
    imageHash: string | null,
    adAccountId: string,
    accessToken: string
  ): Promise<{
    imageUrl: string | null;
    imageUrls: string[];
    imageHashes: string[];
  }> {
    const result = {
      imageUrl: imageUrl || null,
      imageUrls: [] as string[],
      imageHashes: [] as string[]
    };

    if (imageUrl) {
      result.imageUrls.push(imageUrl);
    }

    if (imageHash) {
      result.imageHashes.push(imageHash);
      
      // If we have hash but no URL, fetch it
      if (!imageUrl) {
        try {
          const imageData = await this.fetchImageUrlFromHash(imageHash, adAccountId, accessToken);
          if (imageData.url) {
            result.imageUrl = imageData.url;
            result.imageUrls.push(imageData.url);
          }
        } catch (error: any) {
          console.error(`[Creatives] Error fetching image from hash ${imageHash}:`, error.message);
        }
      }
    }

    return result;
  }

  /**
   * Enrich carousel images - batch fetches from child_attachments hashes
   */
  private async enrichCarouselImages(
    childAttachments: Array<{ imageHash?: string | null; name?: string | null; description?: string | null; link?: string | null }>,
    adAccountId: string,
    accessToken: string
  ): Promise<{
    images: Array<{ url: string; hash: string; width?: number; height?: number; name?: string; description?: string; link?: string }>;
    imageUrls: string[];
    imageHashes: string[];
  }> {
    const result = {
      images: [] as Array<{ url: string; hash: string; width?: number; height?: number; name?: string; description?: string; link?: string }>,
      imageUrls: [] as string[],
      imageHashes: [] as string[]
    };
      
    // Extract all hashes from child_attachments
      const carouselHashes = childAttachments
      .map((child) => child.imageHash)
      .filter((hash): hash is string => !!hash);
      
    if (carouselHashes.length === 0) {
      return result;
    }

    result.imageHashes = carouselHashes;

    try {
        // Batch fetch all image URLs in one API call
        const imageUrls = await this.fetchImageUrlsFromHashes(carouselHashes, adAccountId, accessToken);
      const hashToUrlMap = new Map(imageUrls.map((img) => [img.hash, img]));
        
      // Build images array by matching fetched URLs to child_attachments
        for (const child of childAttachments) {
          if (child.imageHash) {
            const imageData = hashToUrlMap.get(child.imageHash);
            if (imageData?.url) {
            result.images.push({
                url: imageData.url,
              hash: child.imageHash!,
                width: imageData.width ?? undefined,
              height: imageData.height ?? undefined,
              name: child.name || undefined,
              description: child.description || undefined,
              link: child.link || undefined
            });
            result.imageUrls.push(imageData.url);
          }
        }
      }
      
      console.log(`[Creatives] Fetched ${result.images.length} carousel images`);
    } catch (error: any) {
      console.error(`[Creatives] Error fetching carousel images:`, error.message);
    }

    return result;
  }

  /**
   * Enrich dynamic images - smart resolution (check existing URLs, then batch fetch missing)
   */
  private async enrichDynamicImages(
    assetFeedSpec: any,
    adAccountId: string,
    accessToken: string
  ): Promise<{
    images: Array<{ url: string; hash: string; width?: number; height?: number }>;
    imageUrls: string[];
    imageHashes: string[];
  }> {
    const result = {
      images: [] as Array<{ url: string; hash: string; width?: number; height?: number }>,
      imageUrls: [] as string[],
      imageHashes: [] as string[]
    };

    if (!assetFeedSpec?.images || assetFeedSpec.images.length === 0) {
      return result;
    }
        
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
    const hashesNeedingFetch = assetFeedSpec.images
          .filter((img: any) => img.hash && !img.url)
          .map((img: any) => String(img.hash))
          .filter((hash: string) => Boolean(hash)) as string[];
        
    const uniqueHashesNeedingFetch = [...new Set(hashesNeedingFetch)];
        
        console.log(`[Creatives] Found ${imagesWithUrls.length} images with URLs, ${uniqueHashesNeedingFetch.length} hashes need fetching`);
        
        // Fetch missing URLs via batch method
    let fetchedUrls: Array<{ url: string; hash: string; width: number | null; height: number | null }> = [];
        if (uniqueHashesNeedingFetch.length > 0) {
      fetchedUrls = await this.fetchImageUrlsFromHashes(uniqueHashesNeedingFetch, adAccountId, accessToken);
    }

    // Combine: existing URLs + fetched URLs
    result.images = [
            ...imagesWithUrls,
      ...fetchedUrls.map((img) => ({
              url: img.url,
              hash: img.hash,
              width: img.width ?? undefined,
              height: img.height ?? undefined
            }))
          ];

    result.imageUrls = result.images.map((img) => img.url);
    result.imageHashes = result.images.map((img) => img.hash);
        
    console.log(`[Creatives] Total dynamic creative images: ${result.images.length}`);

    return result;
  }

  /**
   * Extract Advantage+ creative data from asset_feed_spec
   */
  private extractAssetFeedData(assetFeedSpec: any): {
    imageHash: string | null;
    primaryText: string | null;
    headline: string | null;
    description: string | null;
    callToAction: any;
  } {
    if (!assetFeedSpec || Object.keys(assetFeedSpec).length === 0) {
        return {
        imageHash: null,
        primaryText: null,
        headline: null,
        description: null,
        callToAction: null
      };
    }

    const assetImages = assetFeedSpec.images || [];
    const assetBodies = assetFeedSpec.bodies || [];
    const assetTitles = assetFeedSpec.titles || [];
    const assetDescriptions = assetFeedSpec.descriptions || [];
    const assetCallToActions = assetFeedSpec.call_to_actions || [];

        return {
      imageHash: assetImages[0]?.hash || null,
      primaryText: assetBodies[0]?.text || null,
      headline: assetTitles[0]?.text || null,
      description: assetDescriptions[0]?.text || null,
      callToAction: assetCallToActions[0] || null
    };
  }

  /**
   * Extract and normalize carousel attachments structure
   */
  private extractChildAttachments(linkData: any): Array<{
    name: string | null;
    description: string | null;
    imageUrl: string | null;
    imageHash: string | null;
    link: string | null;
    videoId: string | null;
  }> {
    const childAttachments = linkData?.child_attachments || [];
    return childAttachments.map((child: any) => ({
      name: child.name || null,
      description: child.description || null,
      imageUrl: child.image_url || null,
      imageHash: child.image_hash || null,
      link: child.link || null,
      videoId: child.video_id || null
    }));
  }

  /**
   * Extract text content from various sources
   */
  private extractContentFields(
    creativeData: any,
    assetFeedData: { primaryText: string | null; headline: string | null; description: string | null },
    linkData: any,
    videoData: any,
    photoData: any
  ): {
    primaryText: string | null;
    headline: string | null;
    description: string | null;
    body: string | null;
  } {
    return {
      primaryText: assetFeedData.primaryText || creativeData.body || linkData.message || photoData.message || videoData.message || null,
      headline: assetFeedData.headline || creativeData.title || linkData.name || null,
      description: assetFeedData.description || linkData.description || null,
      body: assetFeedData.primaryText || creativeData.body || null
    };
  }

  /**
   * Parse and normalize creative data from Facebook API
   * Uses modular functions for better separation of concerns
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
    
    // STEP 1: Determine creative mode and media type
    const creativeMode = this.determineCreativeMode(creativeData);
    const mediaType = this.determineMediaType(creativeData, creativeMode);
    
    console.log(`[Creatives] Creative Mode: ${creativeMode}, Media Type: ${mediaType}`);
    
    // STEP 2: Extract data structures
    const childAttachments = this.extractChildAttachments(linkData);
    const assetFeedData = this.extractAssetFeedData(assetFeedSpec);
    const contentFields = this.extractContentFields(creativeData, assetFeedData, linkData, videoData, photoData);
      
    // STEP 3: Extract media identifiers
    const topLevelVideoId = creativeData.video_id || null;
    const videoId = videoData.video_id || topLevelVideoId || null;
    const imageUrl = creativeData.image_url || null;
    const imageHash = creativeData.image_hash || photoData.image_hash || assetFeedData.imageHash || null;
      
    // STEP 4: Enrich media based on creative mode and media type
    let imageUrls: string[] = [];
    let imageHashes: string[] = [];
    let videoUrls: string[] = [];
    let videoIds: string[] = [];
    let previewIframes: string[] = [];
    // thumbnail_url is always present at top level in Facebook API response
    let thumbnailUrl: string | null = creativeData.thumbnail_url || null;
      
    // Handle DYNAMIC_ASSET_FEED - can have both videos and images
    if (creativeMode === 'DYNAMIC_ASSET_FEED') {
      // Process videos from asset_feed_spec.videos[]
      // Note: Video IDs are not authorized, so we skip video URL fetching
      // Instead, directly fetch preview iframe from creative ID
      if (assetFeedSpec.videos && Array.isArray(assetFeedSpec.videos) && assetFeedSpec.videos.length > 0) {
        console.log(`[Creatives] Processing ${assetFeedSpec.videos.length} dynamic videos from asset_feed_spec (using preview iframe only)`);
        
        // For dynamic asset feed videos, we don't have authorization to fetch video URLs
        // So we directly fetch preview iframe from creative ID and skip video IDs/thumbnails
        try {
          const previewIframe = await this.fetchVideoPreviewIframe(creativeData.id, accessToken);
          if (previewIframe) {
            previewIframes.push(previewIframe);
            console.log(`[Creatives] Fetched preview iframe for dynamic creative ${creativeData.id}`);
          } else {
            console.warn(`[Creatives] No preview iframe available for dynamic creative ${creativeData.id}`);
          }
        } catch (error: any) {
          console.error(`[Creatives] Error fetching preview iframe for dynamic creative ${creativeData.id}:`, error.message);
        }
        
        // Note: We intentionally skip:
        // - videoIds (not authorized to fetch)
        // - videoUrls (not authorized to fetch)
      }
      
      // Process images from asset_feed_spec.images[]
      if (assetFeedSpec.images && Array.isArray(assetFeedSpec.images) && assetFeedSpec.images.length > 0) {
        console.log(`[Creatives] Processing ${assetFeedSpec.images.length} dynamic images from asset_feed_spec`);
        const dynamicEnrichment = await this.enrichDynamicImages(assetFeedSpec, adAccountId, accessToken);
        imageUrls.push(...dynamicEnrichment.imageUrls);
        imageHashes.push(...dynamicEnrichment.imageHashes);
        
      }
    }
    // Handle STATIC mode - can be either image OR video
    else if (creativeMode === 'STATIC') {
      // STATIC video: from object_story_spec.video_data.video_id or top-level video_id
      if (videoId) {
        const videoEnrichment = await this.enrichVideoMedia(videoId, creativeData.id, accessToken);
        videoUrls.push(...videoEnrichment.videoUrls);
        videoIds.push(...videoEnrichment.videoIds);
        previewIframes.push(...videoEnrichment.previewIframes);
      }
      // STATIC image: from top-level image_url
      else if (imageUrl) {
        // Static: single image - use image_url directly if available
        imageUrls.push(imageUrl);
        
        // If we have imageHash, add it
        if (imageHash) {
          imageHashes.push(imageHash);
        }
      }
      // STATIC image with hash but no URL (fallback)
      else if (imageHash) {
        imageHashes.push(imageHash);
        // Fetch URL from hash
        try {
          const imageData = await this.fetchImageUrlFromHash(imageHash, adAccountId, accessToken);
          if (imageData.url) {
            imageUrls.push(imageData.url);
          }
        } catch (error: any) {
          console.error(`[Creatives] Failed to fetch image from hash ${imageHash}:`, error.message);
        }
      }
    }
    // Handle carousel images
    else if (creativeMode === 'STATIC_CAROUSEL' && childAttachments.length > 0) {
      // Carousel: batch fetch from child_attachments
      const carouselEnrichment = await this.enrichCarouselImages(childAttachments, adAccountId, accessToken);
      imageUrls.push(...carouselEnrichment.imageUrls);
      imageHashes.push(...carouselEnrichment.imageHashes);
      
    }
    // Fallback: if no images enriched but we have imageHash, try fetching
    if (imageUrls.length === 0 && imageHash && !imageHashes.includes(imageHash)) {
      try {
        const imageData = await this.fetchImageUrlFromHash(imageHash, adAccountId, accessToken);
        if (imageData.url) {
          imageUrls.push(imageData.url);
          imageHashes.push(imageHash);
        }
      } catch (error: any) {
        console.error(`[Creatives] Failed to fetch image from hash ${imageHash}:`, error.message);
      }
    }
        
    // Parse call to action
    const callToAction = assetFeedData.callToAction || 
                        creativeData.call_to_action || 
                        linkData.call_to_action || 
                        videoData.call_to_action || 
                        null;

    // Normalize childAttachments to match ICreative interface (non-null strings)
    const normalizedChildAttachments = childAttachments.map(child => ({
      name: child.name || '',
      description: child.description || '',
      imageUrl: child.imageUrl || '',
      imageHash: child.imageHash || undefined,
      link: child.link || '',
      videoId: child.videoId || undefined
    }));

    return {
      creativeId: creativeData.id,
      adAccountId,
      name: creativeData.name || null,
      primaryText: contentFields.primaryText,
      headline: contentFields.headline,
      description: contentFields.description,
      body: contentFields.body,
      thumbnailUrl,
      childAttachments: normalizedChildAttachments,
      callToAction,
      creativeMode,
      mediaType,
      imageHashes,
      imageUrls,
      videoIds,
      videoUrls,
      previewIframe: previewIframes,
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
   * Smart refresh creative URLs from Facebook based on creativeMode and mediaType
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

    const creativeMode = existing.creativeMode;
    const mediaType = existing.mediaType;
    console.log(`[Creatives] Creative Mode: ${creativeMode}, Media Type: ${mediaType}`);

    try {
      // Handle dynamic creative image refresh
      if (creativeMode === 'DYNAMIC_ASSET_FEED' || creativeMode === 'DYNAMIC_CATALOG') {
        // Extract hashes from imageHashes array
        const imageHashes = existing.imageHashes.length > 0 
          ? existing.imageHashes 
          : [];

        if (imageHashes.length > 0) {
          console.log(`[Creatives] Refreshing ${imageHashes.length} dynamic creative images...`);
          const imageUrls = await this.fetchImageUrlsFromHashes(imageHashes, adAccountId, accessToken);
          
          if (imageUrls.length > 0) {
            const updates: Partial<ICreative> = {
              imageUrls: imageUrls.map(img => img.url),
              imageHashes: imageUrls.map(img => img.hash),
              thumbnailUrl: imageUrls[0]?.url || existing.thumbnailUrl,
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

      // Handle carousel refresh
      if (creativeMode === 'STATIC_CAROUSEL') {
        const imageHashes = existing.imageHashes.length > 0 
          ? existing.imageHashes 
          : [];

          if (imageHashes.length === 0) {
            console.log(`[Creatives] No image hashes stored, doing full fetch`);
            return this.getCreative(creativeId, adAccountId, accessToken, true);
          }

          console.log(`[Creatives] Refreshing ${imageHashes.length} carousel images`);
          const imageUrls = await this.fetchImageUrlsFromHashes(imageHashes, adAccountId, accessToken);
          
          if (imageUrls.length > 0) {
            const updates: Partial<ICreative> = {
              imageUrls: imageUrls.map(img => img.url),
              imageHashes: imageUrls.map(img => img.hash),
              thumbnailUrl: imageUrls[0]?.url || existing.thumbnailUrl,
              lastFetchedAt: new Date()
            };

            const updated = await creativesRepository.updateCreative(creativeId, updates);
            console.log(`[Creatives] Carousel images refreshed: ${imageUrls.length}/${imageHashes.length}`);
            return updated;
          }
      }

      // Handle video refresh
      if (mediaType === 'VIDEO' || mediaType === 'MIXED') {
        const videoId = existing.videoIds.length > 0 ? existing.videoIds[0] : null;
        if (!videoId) {
          console.log(`[Creatives] No videoId stored, doing full fetch`);
            return this.getCreative(creativeId, adAccountId, accessToken, true);
          }

        console.log(`[Creatives] Refreshing video URL for video_id: ${videoId}`);
        const videoEnrichment = await this.enrichVideoMedia(videoId, creativeId, accessToken);

        if (videoEnrichment.videoUrls.length > 0 || videoEnrichment.previewIframes.length > 0) {
          // Don't add video thumbnail to imageUrls - keep it separate in thumbnailUrl field
            const updates: Partial<ICreative> = {
            videoUrls: videoEnrichment.videoUrls,
            videoIds: videoEnrichment.videoIds,
            previewIframe: videoEnrichment.previewIframes,
            imageUrls: existing.imageUrls, // Keep existing imageUrls unchanged
            thumbnailUrl: videoEnrichment.thumbnailUrl || existing.thumbnailUrl,
              lastFetchedAt: new Date()
            };

            const updated = await creativesRepository.updateCreative(creativeId, updates);
          console.log(`[Creatives] Video URL refreshed successfully`);
            return updated;
          }
      }

      // For STATIC IMAGE or any other case, do full fetch
      console.log(`[Creatives] Doing full fetch for creativeMode: ${creativeMode}, mediaType: ${mediaType}`);
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
