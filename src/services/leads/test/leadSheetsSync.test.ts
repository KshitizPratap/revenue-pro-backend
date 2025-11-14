/**
 * Test script for Lead Sheets Sync
 * 
 * This script:
 * 1. Gets first 2 GHL clients
 * 2. Fetches opportunities from GHL for each client
 * 3. Extracts emails from opportunities
 * 4. Checks in DB if those emails exist and shows their current status
 * 5. Shows what status they would be updated to based on tags
 * 
 * Usage:
 *   - Ensure you have at least 2 active GHL clients configured
 *   - Run: npx ts-node src/services/leads/test/leadSheetsSync.test.ts
 */

import { connectDB } from '../../../pkg/mongodb/connection.js';
import ghlClientService from '../../ghlClient/service/service.js';
import { leadRepository } from '../repository/LeadRepository.js';
import http from '../../../pkg/http/client.js';
import { config } from '../../../config.js';
import logger from '../../../utils/logger.js';

type GhlOpportunity = {
  id: string;
  name: string;
  contact?: {
    email?: string;
    name?: string;
    tags?: string[];
  };
  relations?: Array<{
    tags?: string[];
  }>;
  pipelineId: string;
};

type GhlResponse = {
  opportunities: GhlOpportunity[];
  meta: {
    total: number;
    nextPageUrl?: string | null;
  };
};

// Tag mappings (same as in service)
const NEW_LEAD_TAGS = ['new_lead', "facebook lead"];
const IN_PROGRESS_TAGS = [
  'day1am', 'day1pm', 'day2am', 'day2pm', 'day3am', 'day3pm',
  'day4am', 'day4pm', 'day5am', 'day5pm', 'day6am', 'day6pm',
  'day7am', 'day7pm', 'day8am', 'day8pm', 'day9am', 'day9pm',
  'day10am', 'day10pm', 'day11am', 'day11pm', 'day12am', 'day12pm',
  'day13am', 'day13pm', 'day14am', 'day14pm'
];
const ESTIMATE_SET_TAGS = ['appt_completed', 'job_won', 'job_lost'];
const UNQUALIFIED_TAGS = [
  'dq - bad phone number',
  'dq - job too small',
  'dq - looking for job',
  'dq - no longer interested',
  'dq - out of area',
  'dq - said didn\'t fill out a form',
  'dq - service not offered',
  'dq - services we dont offer'
];

function collectTags(opportunity: GhlOpportunity): string[] {
  const tags: string[] = [];
  
  if (Array.isArray(opportunity.contact?.tags)) {
    tags.push(...opportunity.contact.tags);
  }
  
  if (Array.isArray(opportunity.relations)) {
    for (const rel of opportunity.relations) {
      if (Array.isArray(rel?.tags)) {
        tags.push(...rel.tags);
      }
    }
  }
  
  return tags;
}

function determineLeadStatus(tags: string[]): { status: 'new' | 'in_progress' | 'estimate_set' | 'unqualified'; unqualifiedReason?: string } {
  const lowerTags = tags.map(t => t.toLowerCase().trim());
  
  // Check for unqualified tags (highest priority)
  for (const unqualifiedTag of UNQUALIFIED_TAGS) {
    if (lowerTags.includes(unqualifiedTag.toLowerCase())) {
      return {
        status: 'unqualified',
        unqualifiedReason: unqualifiedTag
      };
    }
  }
  
  // Check for estimate_set tags
  for (const estimateTag of ESTIMATE_SET_TAGS) {
    if (lowerTags.includes(estimateTag.toLowerCase())) {
      return { status: 'estimate_set' };
    }
  }
  
  // Check for in_progress tags
  for (const progressTag of IN_PROGRESS_TAGS) {
    if (lowerTags.includes(progressTag.toLowerCase())) {
      return { status: 'in_progress' };
    }
  }
  
  // Check for new_lead tags
  for (const newTag of NEW_LEAD_TAGS) {
    if (lowerTags.includes(newTag.toLowerCase())) {
      return { status: 'new' };
    }
  }
  
  // Default to new if no matching tags found
  return { status: 'new' };
}

async function fetchOpportunities(locationId: string, apiToken: string, pipelineId: string): Promise<GhlOpportunity[]> {
  const httpClient = new http(config.GHL_BASE_URL, 15000);
  let url: string | null = `/opportunities/search?location_id=${encodeURIComponent(locationId)}`;
  const aggregated: GhlOpportunity[] = [];

  while (url) {
    const page: GhlResponse = await httpClient.get<GhlResponse>(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Version: '2021-07-28',
      },
    });

    if (page?.opportunities?.length) {
      aggregated.push(...page.opportunities);
    }
    const nextUrl: string | null | undefined = page?.meta?.nextPageUrl;
    url = nextUrl && nextUrl.length > 0 ? nextUrl : null;
  }

  // Filter by pipeline
  return aggregated.filter(opp => opp.pipelineId === pipelineId);
}

async function testLeadSheetsSync() {
  try {
    console.log('\n[TEST] Starting Lead Sheets Sync Test...\n');
    logger.info('[Lead Sheets Sync Test] Starting test...');

    // Connect to database
    console.log('[TEST] Connecting to database...');
    await connectDB();
    console.log('[TEST] ✓ Connected to database\n');
    logger.info('[Lead Sheets Sync Test] Connected to database');

    // Get all active GHL clients
    console.log('[TEST] Fetching active GHL clients...');
    const clients = await ghlClientService.getAllActiveGhlClients();
    
    if (!clients || clients.length === 0) {
      console.error('[TEST] ✗ No active GHL clients found');
      console.error('[TEST] Please configure at least one GHL client first\n');
      logger.error('[Lead Sheets Sync Test] No active GHL clients found');
      logger.info('[Lead Sheets Sync Test] Please configure at least one GHL client first');
      process.exit(1);
    }

    console.log(`[TEST] ✓ Found ${clients.length} active GHL client(s)`);
    
    if (clients.length < 2) {
      console.warn(`[TEST] ⚠ Only found ${clients.length} client(s), will test with available clients\n`);
      logger.warn(`[Lead Sheets Sync Test] Only found ${clients.length} client(s), will test with available clients`);
    }

    // Get first 2 clients
    const testClients = clients.slice(0, 2);
    console.log(`[TEST] Testing with first ${testClients.length} client(s)\n`);
    logger.info(`[Lead Sheets Sync Test] Testing with ${testClients.length} client(s)`);

    const results: Array<{
      client: any;
      emails: Array<{
        email: string;
        name: string;
        tags: string[];
        currentStatus?: string;
        newStatus: string;
        unqualifiedReason?: string;
        existsInDB: boolean;
        leadData?: any;
      }>;
    }> = [];

    // Process each client
    for (let i = 0; i < testClients.length; i++) {
      const client = testClients[i];
      const locationId = client.locationId;
      const pipelineId = client.pipelineId;
      const revenueProClientId = client.revenueProClientId;
      const decryptedToken = ghlClientService.getDecryptedApiToken(client);

      if (!locationId || !pipelineId || !revenueProClientId || !decryptedToken) {
        logger.warn(`[Lead Sheets Sync Test] Client ${i + 1} missing required configuration, skipping`);
        continue;
      }

      console.log(`\n[TEST] Processing Client ${i + 1}:`);
      console.log(`  Location ID: ${locationId}`);
      console.log(`  Pipeline ID: ${pipelineId}`);
      console.log(`  RevenuePro Client ID: ${revenueProClientId}`);
      logger.info(`[Lead Sheets Sync Test] Processing Client ${i + 1}:`, {
        locationId,
        pipelineId,
        revenueProClientId,
      });

      try {
        // Fetch opportunities from GHL
        console.log(`\n[TEST] Fetching opportunities from GHL for Client ${i + 1}...`);
        logger.info(`[Lead Sheets Sync Test] Fetching opportunities for Client ${i + 1}...`);
        const opportunities = await fetchOpportunities(locationId, decryptedToken, pipelineId);
        
        console.log(`[TEST] ✓ Found ${opportunities.length} opportunities in pipeline`);
        logger.info(`[Lead Sheets Sync Test] Found ${opportunities.length} opportunities in pipeline for Client ${i + 1}`);

        // Extract emails and check in DB
        console.log(`[TEST] Extracting emails and checking in database...`);
        const emailResults: Array<{
          email: string;
          name: string;
          tags: string[];
          currentStatus?: string;
          newStatus: string;
          unqualifiedReason?: string;
          existsInDB: boolean;
          leadData?: any;
        }> = [];

        let processedCount = 0;
        for (const opp of opportunities) {
          processedCount++;
          if (processedCount % 50 === 0) {
            console.log(`[TEST]   Processed ${processedCount}/${opportunities.length} opportunities...`);
          }
          const email = opp.contact?.email;
          
          if (!email || !email.trim()) {
            continue;
          }

          // Collect tags
          const tags = collectTags(opp);
          
          // Determine new status
          const { status, unqualifiedReason } = determineLeadStatus(tags);

          // Check in DB
          const existingLeads = await leadRepository.findLeads({
            email: email.trim(),
            clientId: revenueProClientId,
          });

          const existsInDB = existingLeads && existingLeads.length > 0;
          const currentStatus = existsInDB ? existingLeads[0].status : undefined;
          const leadData = existsInDB ? existingLeads[0] : undefined;

          emailResults.push({
            email: email.trim(),
            name: opp.contact?.name || opp.name || 'Unknown',
            tags,
            currentStatus,
            newStatus: status,
            unqualifiedReason,
            existsInDB,
            leadData: leadData ? {
              id: (leadData as any)._id?.toString() || 'N/A',
              status: leadData.status,
              unqualifiedLeadReason: leadData.unqualifiedLeadReason,
              service: leadData.service,
              zip: leadData.zip,
              leadDate: leadData.leadDate,
            } : undefined,
          });
        }

        results.push({
          client: {
            locationId,
            pipelineId,
            revenueProClientId,
          },
          emails: emailResults,
        });

        console.log(`[TEST] ✓ Client ${i + 1} processed: ${emailResults.length} emails found\n`);
        logger.info(`[Lead Sheets Sync Test] Client ${i + 1} processed: ${emailResults.length} emails found`);
      } catch (error: any) {
        console.error(`[TEST] ✗ Error processing Client ${i + 1}:`, error?.message || String(error));
        logger.error(`[Lead Sheets Sync Test] Error processing Client ${i + 1}:`, {
          error: error?.message || String(error),
        });
      }
    }

    console.log('\n[TEST] Generating report...\n');

    // Print results
    console.log('\n' + '='.repeat(80));
    console.log('LEAD SHEETS SYNC TEST RESULTS');
    console.log('='.repeat(80) + '\n');

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      console.log(`\nClient ${i + 1}:`);
      console.log(`  Location ID: ${result.client.locationId}`);
      console.log(`  Pipeline ID: ${result.client.pipelineId}`);
      console.log(`  RevenuePro Client ID: ${result.client.revenueProClientId}`);
      console.log(`  Total Emails Found: ${result.emails.length}\n`);

      if (result.emails.length === 0) {
        console.log('  No emails found in opportunities\n');
        continue;
      }

      // Group by status
      const byStatus = {
        existsInDB: result.emails.filter(e => e.existsInDB),
        notInDB: result.emails.filter(e => !e.existsInDB),
      };

      console.log(`  Emails in DB: ${byStatus.existsInDB.length}`);
      console.log(`  Emails NOT in DB: ${byStatus.notInDB.length}\n`);

      // Show first 10 emails in detail
      const emailsToShow = result.emails.slice(0, 10);
      console.log('  Email Details (first 10):');
      console.log('  ' + '-'.repeat(76));
      
      for (const emailData of emailsToShow) {
        console.log(`  Email: ${emailData.email}`);
        console.log(`    Name: ${emailData.name}`);
        console.log(`    Tags: ${emailData.tags.length > 0 ? emailData.tags.join(', ') : 'No tags'}`);
        console.log(`    In DB: ${emailData.existsInDB ? 'YES' : 'NO'}`);
        
        if (emailData.existsInDB) {
          console.log(`    Current Status: ${emailData.currentStatus || 'N/A'}`);
          console.log(`    Would Update To: ${emailData.newStatus}`);
          if (emailData.unqualifiedReason) {
            console.log(`    Unqualified Reason: ${emailData.unqualifiedReason}`);
          }
          if (emailData.leadData) {
            console.log(`    Lead ID: ${emailData.leadData.id}`);
            console.log(`    Service: ${emailData.leadData.service || 'N/A'}`);
            console.log(`    Zip: ${emailData.leadData.zip || 'N/A'}`);
          }
        } else {
          console.log(`    Would Create With Status: ${emailData.newStatus}`);
        }
        console.log('');
      }

      if (result.emails.length > 10) {
        console.log(`  ... and ${result.emails.length - 10} more emails\n`);
      }

      // Summary statistics
      const statusChanges = byStatus.existsInDB.filter(e => e.currentStatus !== e.newStatus);
      console.log('  Summary:');
      console.log(`    Total emails: ${result.emails.length}`);
      console.log(`    In DB: ${byStatus.existsInDB.length}`);
      console.log(`    Would be updated: ${statusChanges.length}`);
      console.log(`    Status changes:`);
      statusChanges.forEach(e => {
        console.log(`      ${e.email}: ${e.currentStatus} → ${e.newStatus}`);
      });
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('[TEST] ✓ Test completed successfully!');
    console.log('='.repeat(80) + '\n');

    logger.info('[Lead Sheets Sync Test] Test completed successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('\n[TEST] ✗ Test failed:', error?.message || String(error));
    if (error?.stack) {
      console.error('[TEST] Stack trace:', error.stack);
    }
    logger.error('[Lead Sheets Sync Test] Test failed:', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exit(1);
  }
}

// Run the test
testLeadSheetsSync();

