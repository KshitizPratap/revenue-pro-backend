import { Request, Response } from "express";
import { LeadService } from "../services/leads/service/service.js";
import utils from "../utils/utils.js";

export class createLead {
  private service: LeadService;

  constructor() {
    this.service = new LeadService();
    this.createLead = this.createLead.bind(this);
  }

  async createLead(req: Request, res: Response): Promise<void> {
      try {
        // Support bulk creation if req.body is array, else single object
        const leadsPayload = Array.isArray(req.body) ? req.body : [req.body];
        const createdLeads = [];
  
        for (const payload of leadsPayload) {
          const lead = await this.service.createLead(payload);
          createdLeads.push(lead);
        }
  
        utils.sendSuccessResponse(res, 201, {
          success: true,
          data: createdLeads.length === 1 ? createdLeads[0] : createdLeads,
        });
      } catch (error) {
        console.error("Error in createLead:", error);
        utils.sendErrorResponse(res, error);
      }
    }
}