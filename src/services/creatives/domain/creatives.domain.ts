import { Document } from "mongoose";

export interface ICreative {
  // Identity
  creativeId: string;
  clientId: string;
  adAccountId: string;
  name: string | null;
  
  // Content
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  body: string | null;
  
  // Thumbnail
  thumbnailUrl: string | null;
  
  // Carousel/Multi-Image Ads
  childAttachments: Array<{
    name: string;
    description: string;
    imageUrl: string;
    imageHash?: string;
    link: string;
    videoId?: string;
  }>;
  
  // Call to Action
  callToAction: {
    type: string;
    value: any;
  } | null;
  
  // Creative Mode (how the creative is assembled)
  creativeMode: 'STATIC' | 'STATIC_CAROUSEL' | 'DYNAMIC_ASSET_FEED' | 'DYNAMIC_CATALOG';
  
  // Media Type (what media it uses)
  mediaType: 'IMAGE' | 'VIDEO' | 'MIXED';
  
  // Media Arrays (enriched URLs and IDs)
  imageHashes: string[];
  imageUrls: string[];
  videoIds: string[];
  videoUrls: string[];
  previewIframe: string[]; // For videos with permission errors
  
  // Object Story Spec (Facebook's creative structure)
  objectStorySpec: any;
  
  // Full API Response (for reference)
  rawData: any;
  
  // Metadata
  lastFetchedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export interface ICreativeDocument extends ICreative, Document {
  createdAt: Date;
  updatedAt: Date;
}
