import { Document } from "mongoose";

export interface IIPTracking extends Document {
  ipAddress: string;
  hashedIp: string;
  timestamp: Date;
  userId: string;
  userAgent?: string;
  referer?: string;
  acceptLanguage?: string;
  
  // IP headers for audit trail
  forwardedFor?: string;
  realIp?: string;
  clientIp?: string;
  cfConnectingIp?: string;
  
  // Additional metadata
  sessionId?: string;
  termsVersion?: string;
  acceptanceMethod?: 'web' | 'mobile' | 'api';
  
  // Integrity hash for tamper detection
  integrityHash?: string;
  
  created_at: Date;
  updated_at: Date;
}
