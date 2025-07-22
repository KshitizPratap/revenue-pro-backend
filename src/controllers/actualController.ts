import { Request, Response } from 'express';
import { ActualService } from '../services/actual/service/service.js';

export class ActualController {
  private actualService: ActualService;

  constructor() {
    this.actualService = new ActualService();
    this.upsertActual = this.upsertActual.bind(this);
    this.getActuals = this.getActuals.bind(this);
  }

  /**
   * Upsert actual data for a single week. Always returns an array of 1 object.
   */
  async upsertActual(req: Request, res: Response): Promise<void> {
    try {
      const user = req.context?.getUser?.();
      let userId: string;
      if (user && user.role === "ADMIN" && req.body.userId) {
        userId = req.body.userId;
      } else {
        userId = req.context?.getUserId?.();
      }

      // Only allow upsert for a single week
      const { startDate, endDate, ...actualData } = req.body;
      if (!startDate) {
        res.status(400).json({ success: false, message: "startDate is required" });
        return;
      }

      // Upsert the actual for the week
      const upserted = await this.actualService.upsertActualWeekly(
        userId,
        startDate,
        endDate,
        actualData
      );

      console.log('upserted', upserted);
      

      // Always return as array for consistency
      res.status(200).json({ success: true, data: [upserted.toObject ? upserted.toObject() : upserted] });
    } catch (error: any) {
      console.error("Error in upsertActual (weekly):", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get actuals for week, month, or year. Always returns an array of objects.
   */
  async getActuals(req: Request, res: Response): Promise<void> {
  try {
    const { startDate, endDate } = req.query;
    const userIdRaw = req.query.userId;
    const userId =
      typeof userIdRaw === "string"
        ? userIdRaw
        : Array.isArray(userIdRaw)
        ? userIdRaw[0]
        : "";

    const startDateStr =
      typeof startDate === "string"
        ? startDate
        : Array.isArray(startDate)
        ? startDate[0]
        : "";
    const endDateStr =
      typeof endDate === "string"
        ? endDate
        : Array.isArray(endDate)
        ? endDate[0]
        : "";

    if (!userId || !startDateStr || !endDateStr) {
      res.status(400).json({ success: false, message: "userId, startDate, and endDate are required query parameters" });
      return;
    }

    // Call the service method to get all actuals in the range
    const results = await this.actualService.getActualsByDateRange(
      String(userId),
      String(startDateStr),
      String(endDateStr)
    );
    console.log("results", results);
    
    res.status(200).json({ success: true, data: results });
  } catch (error: any) {
    console.error("Error in getActuals:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
}