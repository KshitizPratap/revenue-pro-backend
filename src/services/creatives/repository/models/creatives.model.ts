import { Schema, model } from 'mongoose';
import { ICreativeDocument } from '../../domain/creatives.domain.js';

const creativesSchema = new Schema<ICreativeDocument>(
  {
    // Identity
    creativeId: { type: String, required: true, unique: true, index: true },
    adAccountId: { type: String, required: true, index: true },
    name: { type: String, default: null },
    
    // Content
    primaryText: { type: String, default: null },
    headline: { type: String, default: null },
    description: { type: String, default: null },
    body: { type: String, default: null },
    
    // Thumbnail
    thumbnailUrl: { type: String, default: null },
    
    // Carousel/Multi-Image Ads
    childAttachments: {
      type: [{
        name: { type: String },
        description: { type: String },
        imageUrl: { type: String },
        imageHash: { type: String },
        link: { type: String },
        videoId: { type: String }
      }],
      default: []
    },
    
    // Call to Action
    callToAction: { 
      type: Schema.Types.Mixed, 
      default: null 
    },
    
    // Creative Mode (how the creative is assembled)
    creativeMode: {
      type: String,
      enum: ['STATIC', 'STATIC_CAROUSEL', 'DYNAMIC_ASSET_FEED', 'DYNAMIC_CATALOG'],
      required: true
    },
    
    // Media Type (what media it uses)
    mediaType: {
      type: String,
      enum: ['IMAGE', 'VIDEO', 'MIXED'],
      required: true
    },
    
    // Media Arrays (enriched URLs and IDs)
    imageHashes: {
      type: [String],
      default: []
    },
    imageUrls: {
      type: [String],
      default: []
    },
    videoIds: {
      type: [String],
      default: []
    },
    videoUrls: {
      type: [String],
      default: []
    },
    previewIframe: {
      type: [String],
      default: []
    },
    
    // Object Story Spec (Facebook's creative structure)
    objectStorySpec: { type: Schema.Types.Mixed, default: null },
    
    // Full API Response (for reference)
    rawData: { type: Schema.Types.Mixed, default: null },
    
    // Metadata
    lastFetchedAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  { 
    timestamps: true,
    collection: 'creatives'
  }
);

// Indexes for efficient queries
creativesSchema.index({ adAccountId: 1, creativeId: 1 });
creativesSchema.index({ lastFetchedAt: 1 });

const CreativeModel = model<ICreativeDocument>('Creative', creativesSchema);

export default CreativeModel;
