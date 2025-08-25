import { Document } from "mongoose";

export type LeadStatus = 'new' | 'in_progress' | 'estimate_set' | 'unqualified';

export interface ILead {
  leadDate: string;
  name: string;
  email?: string;
  phone?: string;
  zip?: string;
  service: string;
  adSetName: string;
  adName: string;
  status: 'new' | 'in_progress' | 'estimate_set' | 'unqualified';
  clientId: string;
  unqualifiedLeadReason?: string;
  leadScore?: number; // NEW FIELD - calculated lead score
}

export interface ILeadDocument extends ILead, Document {}
