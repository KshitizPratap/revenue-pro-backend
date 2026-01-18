# Creative Parsing Flow - Implementation Documentation

## Overview

The `parseCreativeData` function processes Facebook ad creatives and enriches media URLs based on creative mode and media type. It follows a structured approach to handle static images, videos, carousels, and dynamic creatives.

## Flow Diagram

```
Facebook API Response
    ↓
Determine creativeMode (STATIC | STATIC_CAROUSEL | DYNAMIC_ASSET_FEED | DYNAMIC_CATALOG)
    ↓
Determine mediaType (IMAGE | VIDEO | MIXED)
    ↓
Extract Data Structures (childAttachments, assetFeedData, contentFields)
    ↓
Enrich Media Based on Mode:
    ├─ DYNAMIC_ASSET_FEED → Process videos[] + images[] from asset_feed_spec
    ├─ STATIC_CAROUSEL → Batch fetch from child_attachments
    ├─ STATIC → Use image_url directly or fetch from hash
    └─ Regular Video → Fetch from video_id
    ↓
Populate Arrays (imageUrls[], imageHashes[], videoIds[], videoUrls[], previewIframe[])
    ↓
Return ICreative Object
```

## Creative Mode Detection

### 1. STATIC_CAROUSEL
- **Condition**: `child_attachments.length > 1`
- **Source**: `object_story_spec.link_data.child_attachments[]`
- **Media**: Multiple images via `image_hash`

### 2. DYNAMIC_CATALOG
- **Condition**: `asset_feed_spec.products` exists
- **Source**: Product-based dynamic ads
- **Media**: Product catalog (iframe only)

### 3. DYNAMIC_ASSET_FEED
- **Condition**: `asset_feed_spec.images` OR `asset_feed_spec.videos` exists
- **Source**: Advantage+ creatives with asset feed
- **Media**: Multiple images/videos from `asset_feed_spec`

### 4. STATIC
- **Default**: Single asset, fixed creative
- **Source**: Top-level `image_url` or `video_id`
- **Media**: Single image or video

## Media Type Detection

```typescript
hasImages = image_url || asset_feed_spec.images[] || child_attachments[].image_hash
hasVideos = video_id || asset_feed_spec.videos[] || child_attachments[].video_id

if (hasImages && hasVideos) → MIXED
else if (hasVideos) → VIDEO
else → IMAGE
```

## Media Enrichment Strategies

### 1. DYNAMIC_ASSET_FEED Processing

**Videos from `asset_feed_spec.videos[]`:**
- Extract all `video_id` values
- For each video:
  - Call `enrichVideoMedia()` → Fetch video URL via `/video_id?fields=source`
  - Extract `thumbnail_url` from asset or video API
  - Populate `videoIds[]`, `videoUrls[]`, `previewIframes[]`
  - Add thumbnails to `imageUrls[]`

**Images from `asset_feed_spec.images[]`:**
- Check if images already have `url` field (no API call)
- Extract `hash` values for images without URLs
- Batch fetch missing URLs via `/adimages?hashes=["hash1","hash2"]`
- Populate `imageHashes[]` and `imageUrls[]`

### 2. STATIC_CAROUSEL Processing

- Extract all `image_hash` from `child_attachments[]`
- Batch fetch via `/adimages?hashes=["hash1","hash2",...]`
- Match fetched URLs back to child attachments
- Populate `imageHashes[]` and `imageUrls[]`

### 3. STATIC Image Processing

- Use `image_url` directly if available (no API call)
- If only `image_hash` exists, fetch via `/adimages?hashes=["hash"]`
- Populate `imageHashes[]` and `imageUrls[]`

### 4. Regular Video Processing

- Extract `video_id` from `object_story_spec.video_data` or top-level
- Call `enrichVideoMedia()`:
  - Fetch video URL via `/video_id?fields=source`
  - On permission error (#10), fetch preview iframe via `/creative_id/previews`
  - Extract thumbnail from video API or `video_data.image_url`
- Populate `videoIds[]`, `videoUrls[]`, `previewIframes[]`

## Key Implementation Details

### Array Population
- All arrays use `push(...array)` to merge results
- Duplicate prevention via `includes()` checks
- Arrays handle both single and multiple items

### Thumbnail Priority
1. `asset_feed_spec.videos[].thumbnail_url` (for dynamic videos)
2. Video API `picture` field
3. `video_data.image_url`
4. First image URL from enrichment
5. Top-level `thumbnail_url`

### API Endpoints Used

| Endpoint | Purpose | Parameters |
|----------|---------|------------|
| `/{creativeId}` | Fetch creative metadata | `fields=...` |
| `/{videoId}?fields=source` | Get video URL | `fields=source,picture,length` |
| `/{creativeId}/previews` | Get preview iframe (fallback) | `ad_format=DESKTOP_FEED_STANDARD` |
| `/{accountId}/adimages` | Batch fetch image URLs | `hashes=["hash1","hash2"]` |

### URL Preference Hierarchy

**For Images:**
1. `permalink_url` (permanent, doesn't expire)
2. `url_128` (higher resolution)
3. `url` (temporary, may expire)

**For Videos:**
1. `source` field from video API
2. Preview iframe (on permission errors)

## Output Structure

The function returns `Partial<ICreative>` with populated arrays:

```typescript
{
  creativeId: string
  adAccountId: string
  creativeMode: 'STATIC' | 'STATIC_CAROUSEL' | 'DYNAMIC_ASSET_FEED' | 'DYNAMIC_CATALOG'
  mediaType: 'IMAGE' | 'VIDEO' | 'MIXED'
  thumbnailUrl: string | null
  
  // Array fields (populated based on creative type)
  imageUrls: string[]           // All image URLs
  imageHashes: string[]         // All image hashes
  videoIds: string[]            // All video IDs
  videoUrls: string[]           // All video URLs
  previewIframe: string[]       // Preview iframes (for permission errors)
  
  // Content fields
  primaryText, headline, description, body
  
  // Metadata
  childAttachments, callToAction, objectStorySpec, rawData
}
```

## Error Handling

- **Video fetch failure**: Logs error, continues without video details
- **Image hash resolution failure**: Logs error, continues without image URL
- **Batch fetch failure**: Falls back to individual hash fetches
- **Permission errors (#10)**: Falls back to preview iframe
- **Graceful degradation**: Always returns a result, even if some enrichment fails

## Performance Optimizations

1. **Batch API Calls**: Multiple hashes resolved in single request
2. **Check Existing URLs First**: Avoids unnecessary API calls for dynamic creatives
3. **Parallel Processing**: Videos and images processed independently
4. **Hash Deduplication**: Removes duplicate hashes before batch fetch
5. **Direct URL Usage**: Uses `image_url` directly when available (no API call)

## Example Flows

### Dynamic Creative with Videos
```
Input: asset_feed_spec.videos = [{video_id: "123", thumbnail_url: "..."}, {video_id: "456"}]
  ↓
Extract: videoIds = ["123", "456"]
  ↓
Enrich: For each video_id → fetch video URL + thumbnail
  ↓
Output: videoIds[], videoUrls[], imageUrls[] (thumbnails), previewIframes[]
```

### Dynamic Creative with Images
```
Input: asset_feed_spec.images = [{hash: "abc", url: "..."}, {hash: "def"}]
  ↓
Phase 1: Use existing URL for "abc" (no API call)
  ↓
Phase 2: Batch fetch "def" → /adimages?hashes=["def"]
  ↓
Output: imageHashes = ["abc", "def"], imageUrls = ["url1", "url2"]
```

### Carousel Creative
```
Input: child_attachments = [{image_hash: "h1"}, {image_hash: "h2"}, {image_hash: "h3"}]
  ↓
Extract: hashes = ["h1", "h2", "h3"]
  ↓
Batch Fetch: /adimages?hashes=["h1","h2","h3"]
  ↓
Match: URLs back to child_attachments by hash
  ↓
Output: imageHashes[], imageUrls[]
```
