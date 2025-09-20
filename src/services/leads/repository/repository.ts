import LeadModel from './models/leads.model.js';
import { ILead, ILeadDocument } from '../domain/leads.domain.js';
import ConversionRateModel, { IConversionRate, IConversionRateDocument } from './models/conversionRate.model.js';

// ----------------- Lead Repository -----------------
export const leadRepository = {
  async createLead(data: ILead): Promise<ILeadDocument> {
    return await LeadModel.create({ ...data, isDeleted: false });
  },
  async getLeads(filter: Partial<ILead> = {}): Promise<ILeadDocument[]> {
    return await LeadModel.find({ ...filter, isDeleted: false }).exec();
  },
  async getLeadById(id: string): Promise<ILeadDocument | null> {
    return await LeadModel.findOne({ _id: id, isDeleted: false }).exec();
  },
  async updateLead(
    queryOrId: string | Partial<Pick<ILeadDocument, "clientId" | "adSetName" | "email" | "phone" | "service" | "adName" | "zip">>,
    update: Partial<ILead>
  ): Promise<ILeadDocument | null> {
    // Determine if it's a string (id) or query object
    const query = typeof queryOrId === 'string'
      ? { _id: queryOrId, isDeleted: false }
      : { ...queryOrId, isDeleted: false };

    return await LeadModel.findOneAndUpdate(query, update, { new: true }).exec();
  },
  // New method for upsert operations
  async upsertLead(
    query: Partial<Pick<ILeadDocument, "clientId" | "adSetName" | "email" | "phone" | "service" | "adName" | "zip">>,
    leadPayload: Partial<ILead>
  ): Promise<ILeadDocument> {
    const finalQuery = { ...query, isDeleted: false };
    const finalPayload = { ...leadPayload, isDeleted: false };
    
    return await LeadModel.findOneAndUpdate(
      finalQuery,
      { $set: finalPayload },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).exec();
  },
  async deleteLead(id: string): Promise<ILeadDocument | null> {
    // Soft delete instead of hard delete
    return await LeadModel.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true }
    ).exec();
  },
  async getLeadsByDateRange(start: string, end: string): Promise<ILeadDocument[]> {
    return await LeadModel.find({
      leadDate: { $gte: start, $lte: end },
      isDeleted: false
    }).exec();
  },
  async insertMany(leads: ILead[]): Promise<ILeadDocument[]> {
    // Ensure inserted docs also default to isDeleted: false
    const normalizedLeads = leads.map(lead => ({ ...lead, isDeleted: false }));
    return await LeadModel.insertMany(normalizedLeads);
  },
  async getLeadsByClientId(clientId: string): Promise<Partial<ILead>[]> {
    return await LeadModel.find({ clientId, isDeleted: false }).lean().exec();
  },
  async bulkWriteLeads(
    bulkOps: Parameters<typeof LeadModel.bulkWrite>[0],
    options?: Parameters<typeof LeadModel.bulkWrite>[1]
  ): Promise<ReturnType<typeof LeadModel.bulkWrite>> {
    return await LeadModel.bulkWrite(bulkOps, options);
  },
  async findLeads(query: Partial<ILead> = {}): Promise<Partial<ILead>[]> {
    return await LeadModel.find({ ...query, isDeleted: false }).lean().exec();
  },
  async existsByClientId(clientId: string): Promise<boolean> {
    const doc = await LeadModel.exists({ clientId, isDeleted: false });
    return doc !== null;
  },
  async findLeadsWithCount(options: {
  query?: Partial<ILead>;
  sortField?: string;
  sortOrder?: 1 | -1;
  skip?: number;
  limit?: number;
  }): Promise<{ totalCount: number; leads: Partial<ILead>[] }> {
    const {
      query = {},
      sortField = '_id',
      sortOrder = 1,
      skip = 0,
      limit = 10
    } = options;

    // Merge isDeleted: false into query
    const finalQuery = { ...query, isDeleted: false };

    const [totalCount, leads] = await Promise.all([
      LeadModel.countDocuments(finalQuery).exec(),
      LeadModel.find(finalQuery)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()
    ]);

    return { totalCount, leads };
  },
  async getLeadFilterOptionsAndStats(query: any): Promise<{
        services: string[];
        adSetNames: string[];
        adNames: string[];
        statuses: string[];
        unqualifiedLeadReasons: string[];
        statusAgg: { _id: string; count: number }[];
    }> {
        const finalQuery = { ...query, isDeleted: false };
        const unqualifiedQuery = { ...finalQuery, status: "unqualified" };

        const [services, adSetNames, adNames, statuses, unqualifiedLeadReasons, statusAgg] =
            await Promise.all([
                LeadModel.distinct("service", finalQuery).exec(),
                LeadModel.distinct("adSetName", finalQuery).exec(),
                LeadModel.distinct("adName", finalQuery).exec(),
                LeadModel.distinct("status", finalQuery).exec(),
                LeadModel.distinct("unqualifiedLeadReason", unqualifiedQuery).exec(),
                LeadModel.aggregate([
                    { $match: finalQuery },
                    {
                        $group: {
                            _id: "$status",
                            count: { $sum: 1 }
                        }
                    }
                ]).exec()
            ]);

        return { services, adSetNames, adNames, statuses, unqualifiedLeadReasons, statusAgg };
    },
    async updateManyLeads(query: Partial<ILead>, update: any): Promise<any> {
        // Ensure the query always includes the soft-delete filter
        const finalQuery = { ...query, isDeleted: false };
        
        // LeadModel.updateMany returns an object with { acknowledged, modifiedCount, upsertedId }
        return await LeadModel.updateMany(finalQuery, update).exec();
    },
    async getSortedLeads(query: Partial<ILead> = {}): Promise<Partial<ILead>[]> {
        const finalQuery = { ...query, isDeleted: false };
        return await LeadModel.find(finalQuery)
          .sort({ leadDate: 1, _id: 1 })
          .lean()
          .exec();
    },
    async bulkDeleteLeads(ids: string[]): Promise<{ modifiedCount: number }> {
      const query = { _id: { $in: ids }, isDeleted: false };
      const update = { 
        $set: { 
          isDeleted: true, 
          deletedAt: new Date() 
        } 
      };
      const result = await LeadModel.updateMany(query, update).exec();
      return { modifiedCount: result.modifiedCount || 0 };
    },
    async getDistinctClientIds(): Promise<string[]> {
      return await LeadModel.distinct("clientId", { isDeleted: false }).exec();
    },
    async getAdSetPerformance(
      query: any, 
      page: number, 
      limit: number, 
      sortOptions?: any
    ): Promise<{ totalCount: number; data: any[] }> {
      
      // Ensure the query always includes the soft-delete filter
      const finalQuery = { ...query, isDeleted: false };
      
      const pipeline: any[] = [
        { $match: finalQuery }, // Use finalQuery with isDeleted: false
        {
          $group: {
            _id: '$adSetName',
            total: { $sum: 1 },
            estimateSet: {
              $sum: { $cond: [{ $eq: ['$status', 'estimate_set'] }, 1, 0] }
            }
          }
        },
        {
          $project: {
            adSetName: '$_id',
            total: 1,
            estimateSet: 1,
            percentage: {
              $multiply: [
                { $divide: ['$estimateSet', '$total'] },
                100
              ]
            },
            _id: 0
          }
        }
      ];

      // Add sorting
      if (sortOptions?.showTopRanked) {
        pipeline.push({ $sort: { percentage: -1, estimateSet: -1 } });
      } else if (sortOptions?.adSetSortField) {
        const sortField = sortOptions.adSetSortField === 'percentage'
          ? 'percentage'
          : sortOptions.adSetSortField;

        const sortOrder: 1 | -1 = sortOptions.adSetSortOrder === 'asc' ? 1 : -1;
        pipeline.push({ $sort: { [sortField]: sortOrder } });
      }

      // Define the pagination stages
      const skip = (page - 1) * limit;
      const paginationPipeline: any[] = [
        { $skip: skip },
        { $limit: limit }
      ];

      // Run the aggregation with $facet to get both total count and paginated data in one call
      const result = await LeadModel.aggregate([
        {
          $facet: {
            totalCount: [
              ...pipeline,
              { $count: 'total' }
            ],
            data: [
              ...pipeline,
              ...paginationPipeline
            ]
          }
        }
      ]);

      // Extract and format results
      const totalCount = result[0].totalCount[0]?.total || 0;
      const data = result[0].data || [];
      
      return { totalCount, data };
    },
    // Add this new function to your existing leadRepository object

    async getAdNamePerformance(
      query: any, 
      page: number, 
      limit: number, 
      sortOptions?: any
    ): Promise<{ totalCount: number; data: any[] }> {
      
      // Ensure the query always includes the soft-delete filter
      const finalQuery = { ...query, isDeleted: false };
      
      const pipeline: any[] = [
        { $match: finalQuery }, // Use finalQuery with isDeleted: false
        {
          $group: {
            _id: { adName: '$adName', adSetName: '$adSetName' },
            total: { $sum: 1 },
            estimateSet: {
              $sum: { $cond: [{ $eq: ['$status', 'estimate_set'] }, 1, 0] }
            }
          }
        },
        {
          $project: {
            adName: '$_id.adName',
            adSetName: '$_id.adSetName',
            total: 1,
            estimateSet: 1,
            percentage: {
              $multiply: [
                { $divide: ['$estimateSet', '$total'] },
                100
              ]
            },
            _id: 0
          }
        }
      ];

      // Add sorting
      if (sortOptions?.showTopRanked) {
        pipeline.push({ $sort: { percentage: -1, estimateSet: -1 } });
      } else if (sortOptions?.adNameSortField) {
        const sortField = sortOptions.adNameSortField === 'percentage' ? 'percentage' : sortOptions.adNameSortField;
        const sortOrder: 1 | -1 = sortOptions.adNameSortOrder === 'asc' ? 1 : -1;
        pipeline.push({ $sort: { [sortField]: sortOrder } });
      }

      // Define the pagination stages
      const skip = (page - 1) * limit;
      const paginationPipeline: any[] = [
        { $skip: skip },
        { $limit: limit }
      ];

      // Run the aggregation with $facet to get both total count and paginated data in one call
      const result = await LeadModel.aggregate([
        {
          $facet: {
            totalCount: [
              ...pipeline,
              { $count: 'total' }
            ],
            data: [
              ...pipeline,
              ...paginationPipeline
            ]
          }
        }
      ]);

      // Extract and format results
      const totalCount = result[0].totalCount[0]?.total || 0;
      const data = result[0].data || [];
      
      return { totalCount, data };
    },
};

// ----------------- ConversionRate Repository -----------------
export const conversionRateRepository = {
  async createConversionRate(data: IConversionRate): Promise<IConversionRateDocument> {
    return await ConversionRateModel.create(data);
  },
  async getConversionRates(filter: Partial<IConversionRate> = {}): Promise<IConversionRateDocument[]> {
    return await ConversionRateModel.find(filter).exec();
  },
  async getConversionRateById(id: string): Promise<IConversionRateDocument | null> {
    return await ConversionRateModel.findById(id).exec();
  },
  async updateConversionRate(id: string, update: Partial<IConversionRate>): Promise<IConversionRateDocument | null> {
    return await ConversionRateModel.findByIdAndUpdate(id, update, { new: true }).exec();
  },
  async deleteConversionRate(id: string): Promise<IConversionRateDocument | null> {
    return await ConversionRateModel.findByIdAndDelete(id).exec();
  },
  async insertMany(conversionRates: IConversionRate[]): Promise<IConversionRateDocument[]> {
    return await ConversionRateModel.insertMany(conversionRates);
  },
  async upsertConversionRate(data: IConversionRate): Promise<IConversionRateDocument> {
    return await ConversionRateModel.findOneAndUpdate(
      { clientId: data.clientId, keyField: data.keyField, keyName: data.keyName },
      data,
      { new: true, upsert: true }
    ).exec();
  },

  /**
   * Batch upsert multiple conversion rates - much more efficient than individual upserts
   * Now returns detailed statistics about new vs updated records
   */
  async batchUpsertConversionRates(conversionRates: IConversionRate[]): Promise<{
    documents: IConversionRateDocument[];
    stats: {
      total: number;
      newInserts: number;
      updated: number;
    };
  }> {
    if (conversionRates.length === 0) {
      return { 
        documents: [], 
        stats: { total: 0, newInserts: 0, updated: 0 } 
      };
    }

    // First, get existing conversion rates to compare values
    const filters = conversionRates.map(rate => ({
      clientId: rate.clientId,
      keyField: rate.keyField,
      keyName: rate.keyName
    }));
    
    const existingRates = await ConversionRateModel.find({ $or: filters }).lean().exec();
    const existingRatesMap = new Map();
    existingRates.forEach(rate => {
      const key = `${rate.clientId}-${rate.keyField}-${rate.keyName}`;
      existingRatesMap.set(key, rate);
    });

    // Use MongoDB bulkWrite for efficient batch operations
    const bulkOps = conversionRates.map((rate) => ({
      updateOne: {
        filter: { 
          clientId: rate.clientId, 
          keyField: rate.keyField, 
          keyName: rate.keyName 
        },
        update: { $set: rate },
        upsert: true
      }
    }));

    const result = await ConversionRateModel.bulkWrite(bulkOps);
    
    // Count actual changes by comparing values
    let newInserts = result.upsertedCount || 0;
    let actuallyUpdated = 0;
    
    conversionRates.forEach(rate => {
      const key = `${rate.clientId}-${rate.keyField}-${rate.keyName}`;
      const existing = existingRatesMap.get(key);
      
      if (existing) {
        // Check if values actually changed
        if (existing.conversionRate !== rate.conversionRate || 
            existing.pastTotalCount !== rate.pastTotalCount || 
            existing.pastTotalEst !== rate.pastTotalEst) {
          actuallyUpdated++;
        }
      }
    });
    
    const total = newInserts + actuallyUpdated;
    
    // Return the updated documents - fetch them after bulk operation
    const documents = await ConversionRateModel.find({ $or: filters }).exec();
    
    return {
      documents,
      stats: {
        total,
        newInserts,
        updated: actuallyUpdated
      }
    };
  }
};
