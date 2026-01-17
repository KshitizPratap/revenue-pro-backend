// facebookCredentialsService.ts
import UserService from '../user/service/service.js';
import { config } from '../../config.js';

export interface FacebookCredentials {
  adAccountId: string;
  accessToken: string;
}

export class FacebookCredentialsService {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * Get Facebook adAccountId and accessToken from clientId
   * Follows the standard pattern used across controllers
   * 
   * @param clientId - The client user ID
   * @returns FacebookCredentials object with adAccountId and accessToken, or null if not found
   */
  async getCredentials(clientId: string): Promise<FacebookCredentials | null> {
    try {
      // Get client user to resolve fbAdAccountId
      const clientUser = await this.userService.getUserById(clientId);
      if (!clientUser) {
        console.error(`[FacebookCredentials] Client user not found: ${clientId}`);
        return null;
      }

      const rawAdAccountId = (clientUser as any).fbAdAccountId as string | undefined;
      if (!rawAdAccountId) {
        console.error(`[FacebookCredentials] Client does not have a configured Facebook Ad Account ID: ${clientId}`);
        return null;
      }

      // Format ad account ID (ensure act_ prefix)
      const formattedAdAccountId = rawAdAccountId.startsWith('act_')
        ? rawAdAccountId
        : `act_${rawAdAccountId}`;

      // Get Meta access token from hardcoded client
      const metaTokenClientId = config.META_USER_TOKEN_ID;
      const metaTokenUser = await this.userService.getUserById(metaTokenClientId);
      const accessToken = (metaTokenUser as any)?.metaAccessToken as string | undefined;

      if (!accessToken) {
        console.error(`[FacebookCredentials] Meta access token not configured`);
        return null;
      }

      return {
        adAccountId: formattedAdAccountId,
        accessToken
      };
    } catch (error: any) {
      console.error(`[FacebookCredentials] Error fetching credentials:`, error.message || error);
      return null;
    }
  }
}

export const facebookCredentialsService = new FacebookCredentialsService();
