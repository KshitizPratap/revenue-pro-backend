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
      
      const response = await fbGet(`/${accountId}/adimages`, {
        hashes: JSON.stringify([imageHash]),
        fields: 'id,account_id,hash,height,width,name,url,url_128,permalink_url,created_time,updated_time'
      }, accessToken);
      
      if (response?.data && Array.isArray(response.data)) {
        const imageData = response.data.find((img: any) => img.hash === imageHash);
        
        if (imageData) {
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
      
      const response = await fbGet(`/${accountId}/adimages`, {
        hashes: JSON.stringify(imageHashes),
        fields: 'hash,url,url_128,permalink_url,width,height'
      }, accessToken);

      const results: Array<{ url: string; hash: string; width: number | null; height: number | null }> = [];

      if (response?.data && Array.isArray(response.data)) {
        const hashMap = new Map(imageHashes.map(h => [h, true]));
        
        for (const imageData of response.data) {
          if (imageData?.hash && hashMap.has(imageData.hash)) {
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
      
      let highQualityThumbnail = videoData.picture;
      if (videoData.thumbnails?.data?.length > 0) {
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
    
    if (linkData.child_attachments && linkData.child_attachments.length > 1) {
      return 'STATIC_CAROUSEL';
    }
    
    if (assetFeedSpec.products) {
      return 'DYNAMIC_CATALOG';
    }
    
    if (assetFeedSpec.images || assetFeedSpec.videos) {
      return 'DYNAMIC_ASSET_FEED';
    }
    
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
    
    const hasImages = !!(
      creativeData.image_url ||
      (assetFeedSpec.images && assetFeedSpec.images.length > 0) ||
      (linkData.child_attachments && linkData.child_attachments.some((child: any) => child.image_hash))
    );
    
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
      const videoDetails = await this.fetchVideoDetails(videoId, accessToken);
    
      if (videoDetails && videoDetails.source) {
        result.videos.push({
          id: videoId,
          url: videoDetails.source,
          thumbnailUrl: videoDetails.picture || null,
          duration: videoDetails.length || undefined
        });
        result.videoUrls.push(videoDetails.source);
        result.thumbnailUrl = videoDetails.picture || null;
    } else {
        const previewIframe = await this.fetchVideoPreviewIframe(creativeId, accessToken);
        if (previewIframe) {
          result.previewIframes.push(previewIframe);
        }
      }
    } catch (error: any) {
      if (error.code === 10 || error.error?.code === 10 || error.message?.includes('permission')) {
        const previewIframe = await this.fetchVideoPreviewIframe(creativeId, accessToken);
        if (previewIframe) {
          result.previewIframes.push(previewIframe);
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
      
      const carouselHashes = childAttachments
      .map((child) => child.imageHash)
      .filter((hash): hash is string => !!hash);
      
    if (carouselHashes.length === 0) {
      return result;
    }

    result.imageHashes = carouselHashes;

    try {
        const imageUrls = await this.fetchImageUrlsFromHashes(carouselHashes, adAccountId, accessToken);
      const hashToUrlMap = new Map(imageUrls.map((img) => [img.hash, img]));
        
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
        
        const imagesWithUrls = assetFeedSpec.images
          .filter((img: any) => img.url && img.hash)
          .map((img: any) => ({
            url: img.url,
            hash: img.hash,
            width: img.width ?? undefined,
            height: img.height ?? undefined
          }));
        
    const hashesNeedingFetch = assetFeedSpec.images
          .filter((img: any) => img.hash && !img.url)
          .map((img: any) => String(img.hash))
          .filter((hash: string) => Boolean(hash)) as string[];
        
    const uniqueHashesNeedingFetch = [...new Set(hashesNeedingFetch)];
        
    let fetchedUrls: Array<{ url: string; hash: string; width: number | null; height: number | null }> = [];
        if (uniqueHashesNeedingFetch.length > 0) {
      fetchedUrls = await this.fetchImageUrlsFromHashes(uniqueHashesNeedingFetch, adAccountId, accessToken);
    }

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
    let previewIframes: string[] = [];
    try {
      const previewIframe = await this.fetchVideoPreviewIframe(creativeData.id, accessToken);
      if (previewIframe) {
        previewIframes.push(previewIframe);
      }
    } catch (error: any) {
      console.error(`[Creatives] Error fetching preview iframe for creative ${creativeData.id}:`, error.message);
    }
    
    const oss = creativeData.object_story_spec || {};
    const linkData = oss.link_data || {};
    const photoData = oss.photo_data || {};
    const videoData = oss.video_data || {};
    const assetFeedSpec = creativeData.asset_feed_spec || {};
    
    const creativeMode = this.determineCreativeMode(creativeData);
    const mediaType = this.determineMediaType(creativeData, creativeMode);
    
    const childAttachments = this.extractChildAttachments(linkData);
    const assetFeedData = this.extractAssetFeedData(assetFeedSpec);
    const contentFields = this.extractContentFields(creativeData, assetFeedData, linkData, videoData, photoData);
      
    const topLevelVideoId = creativeData.video_id || null;
    const videoId = videoData.video_id || topLevelVideoId || null;
    const imageUrl = creativeData.image_url || null;
    const imageHash = creativeData.image_hash || photoData.image_hash || assetFeedData.imageHash || null;
      
    let imageUrls: string[] = [];
    let imageHashes: string[] = [];
    let videoUrls: string[] = [];
    let videoIds: string[] = [];
    let thumbnailUrl: string | null = creativeData.thumbnail_url || null;
      
    if (creativeMode === 'DYNAMIC_ASSET_FEED') {
      if (assetFeedSpec.images && Array.isArray(assetFeedSpec.images) && assetFeedSpec.images.length > 0) {
        const dynamicEnrichment = await this.enrichDynamicImages(assetFeedSpec, adAccountId, accessToken);
        imageUrls.push(...dynamicEnrichment.imageUrls);
        imageHashes.push(...dynamicEnrichment.imageHashes);
      }
    }
    else if (creativeMode === 'STATIC') {
      if (videoId) {
        const videoEnrichment = await this.enrichVideoMedia(videoId, creativeData.id, accessToken);
        videoUrls.push(...videoEnrichment.videoUrls);
        videoIds.push(...videoEnrichment.videoIds);
        previewIframes.push(...videoEnrichment.previewIframes);
      }
      else if (imageUrl) {
        imageUrls.push(imageUrl);
        
        if (imageHash) {
          imageHashes.push(imageHash);
        }
      }
      else if (imageHash) {
        imageHashes.push(imageHash);
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
    else if (creativeMode === 'STATIC_CAROUSEL' && childAttachments.length > 0) {
      const carouselEnrichment = await this.enrichCarouselImages(childAttachments, adAccountId, accessToken);
      imageUrls.push(...carouselEnrichment.imageUrls);
      imageHashes.push(...carouselEnrichment.imageHashes);
    }
    
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
        
    const callToAction = assetFeedData.callToAction || 
                        creativeData.call_to_action || 
                        linkData.call_to_action || 
                        videoData.call_to_action || 
                        null;

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

    if (!forceRefresh) {
      const cached = await creativesRepository.getCreativeById(creativeId);
      if (cached && cached.lastFetchedAt) {
        const daysSinceUpdate = (Date.now() - new Date(cached.lastFetchedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate < 7) {
          return cached;
        }
      }
    }

    try {
      const creativeData = await this.fetchCreativeFromFacebook(creativeId, accessToken);
      const parsedCreative = await this.parseCreativeData(creativeData, adAccountId, accessToken);
      const updated = await creativesRepository.upsertCreative(parsedCreative);
      return updated;
    } catch (error: any) {
      console.error(`[Creatives] Error fetching creative ${creativeId}:`, error.message || error);
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

    const cached = await creativesRepository.getCreativesByIds(uniqueIds);
    const cachedMap: Record<string, ICreative> = {};
    const now = Date.now();
    
    cached.forEach(c => {
      const daysSinceUpdate = (now - new Date(c.lastFetchedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 7) {
        cachedMap[c.creativeId] = c;
      }
    });

    const toFetch = uniqueIds.filter(id => !cachedMap[id]);

    if (toFetch.length === 0) {
      return cachedMap;
    }

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
    const existing = await creativesRepository.getCreativeById(creativeId);
    if (!existing) {
      return this.getCreative(creativeId, adAccountId, accessToken, true);
    }

    const creativeMode = existing.creativeMode;
    const mediaType = existing.mediaType;

    try {
      if (creativeMode === 'DYNAMIC_ASSET_FEED' || creativeMode === 'DYNAMIC_CATALOG') {
        const imageHashes = existing.imageHashes.length > 0 
          ? existing.imageHashes 
          : [];

        if (imageHashes.length > 0) {
          const imageUrls = await this.fetchImageUrlsFromHashes(imageHashes, adAccountId, accessToken);
          
          if (imageUrls.length > 0) {
            const updates: Partial<ICreative> = {
              imageUrls: imageUrls.map(img => img.url),
              imageHashes: imageUrls.map(img => img.hash),
              thumbnailUrl: imageUrls[0]?.url || existing.thumbnailUrl,
              lastFetchedAt: new Date()
            };

            const updated = await creativesRepository.updateCreative(creativeId, updates);
            return updated;
          }
        }
        
        return this.getCreative(creativeId, adAccountId, accessToken, true);
      }

      if (creativeMode === 'STATIC_CAROUSEL') {
        const imageHashes = existing.imageHashes.length > 0 
          ? existing.imageHashes 
          : [];

          if (imageHashes.length === 0) {
            return this.getCreative(creativeId, adAccountId, accessToken, true);
          }

          const imageUrls = await this.fetchImageUrlsFromHashes(imageHashes, adAccountId, accessToken);
          
          if (imageUrls.length > 0) {
            const updates: Partial<ICreative> = {
              imageUrls: imageUrls.map(img => img.url),
              imageHashes: imageUrls.map(img => img.hash),
              thumbnailUrl: imageUrls[0]?.url || existing.thumbnailUrl,
              lastFetchedAt: new Date()
            };

            const updated = await creativesRepository.updateCreative(creativeId, updates);
            return updated;
          }
      }

      if (mediaType === 'VIDEO' || mediaType === 'MIXED') {
        const videoId = existing.videoIds.length > 0 ? existing.videoIds[0] : null;
        if (!videoId) {
            return this.getCreative(creativeId, adAccountId, accessToken, true);
          }

        const videoEnrichment = await this.enrichVideoMedia(videoId, creativeId, accessToken);

        if (videoEnrichment.videoUrls.length > 0 || videoEnrichment.previewIframes.length > 0) {
            const updates: Partial<ICreative> = {
            videoUrls: videoEnrichment.videoUrls,
            videoIds: videoEnrichment.videoIds,
            previewIframe: videoEnrichment.previewIframes,
            imageUrls: existing.imageUrls,
            thumbnailUrl: videoEnrichment.thumbnailUrl || existing.thumbnailUrl,
              lastFetchedAt: new Date()
            };

            const updated = await creativesRepository.updateCreative(creativeId, updates);
            return updated;
          }
      }

      return this.getCreative(creativeId, adAccountId, accessToken, true);

    } catch (error: any) {
      console.error(`[Creatives] Error in smart refresh:`, error.message);
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
    const { fbWeeklyAnalyticsRepository } = await import('../../facebook/repository/FbWeeklyAnalyticsRepository.js');
    
    const analytics = await fbWeeklyAnalyticsRepository.getAnalyticsByDateRange(
      clientId,
      startDate,
      endDate
    );

    const creativeIds = Array.from(new Set(
      analytics
        .map(a => a.creative?.id)
        .filter((id): id is string => !!id)
    ));

    if (creativeIds.length === 0) {
      return { saved: 0, failed: 0, creativeIds: [] };
    }

    let saved = 0;
    let failed = 0;

    const BATCH_SIZE = 10;
    for (let i = 0; i < creativeIds.length; i += BATCH_SIZE) {
      const batch = creativeIds.slice(i, i + BATCH_SIZE);
      
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

    return { saved, failed, creativeIds };
  }
}

export const creativesService = new CreativesService();
