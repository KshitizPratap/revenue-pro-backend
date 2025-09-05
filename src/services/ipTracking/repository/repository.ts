import IPTracking, { IIPTrackingModel } from "./models/ipTracking.model.js";
import { IIPTracking } from "../domain/ipTracking.domain.js";

class IPTrackingRepository {
  async createIPTracking(ipTrackingData: Partial<IIPTracking>): Promise<IIPTracking> {
    const ipTracking = new IPTracking(ipTrackingData);
    return await ipTracking.save();
  }

  async getIPTrackingByUserId(userId: string, limit: number = 100): Promise<IIPTracking[]> {
    return await IPTracking.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec();
  }
}

export default IPTrackingRepository;
