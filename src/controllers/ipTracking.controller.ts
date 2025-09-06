import { Request, Response } from "express";
import IPTrackingService from "../services/ipTracking/service/service.js";
import { Context } from "../services/common/domain/context.js";
import utils from "../utils/utils.js";

class IPTrackingController {
  private ipTrackingService: IPTrackingService;

  constructor(ipTrackingService: IPTrackingService) {
    this.ipTrackingService = ipTrackingService;
  }

  async trackActivity(req: Request, res: Response): Promise<void> {
    try {
      const context = new Context();
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          message: "User ID is required",
        });
        return;
      }

      const result = await this.ipTrackingService.trackUserActivity(context, req, userId);

      res.status(200).json({
        success: true,
        data: result,
        message: "Activity tracked successfully",
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  }

  async getUserActivity(req: Request, res: Response): Promise<void> {
    try {
      const context = new Context();
      const { userId } = req.params;
      const { limit } = req.query;

      const result = await this.ipTrackingService.getUserActivityHistory(
        context,
        userId,
        limit ? parseInt(limit as string) : 100
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "User activity retrieved successfully",
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  }
}

export default IPTrackingController;
