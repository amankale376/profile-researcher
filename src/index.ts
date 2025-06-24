import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
// Using JSON file storage instead of SQLite to avoid native binding issues
import { createObjectCsvWriter } from "csv-writer";
import * as fs from "fs";
import * as path from "path";
import { dirname } from "path";
import OpenAI from "openai";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Get current directory - compatible with both CommonJS and ES modules
const __dirname = __filename ? dirname(__filename) : process.cwd();

// Configuration schema - reads from environment variables with fallbacks
export const configSchema = z.object({
  debug: z.boolean().default(process.env.DEBUG === 'true').describe("Enable debug logging"),
  apolloApiKey: z.string().default(process.env.APOLLO_API_KEY || '').describe("Apollo.io API key"),
  nubelaApiKey: z.string().default(process.env.NUBELA_API_KEY || '').describe("Nubela Proxycurl API key"),
  openaiApiKey: z.string().default(process.env.OPENAI_API_KEY || '').describe("OpenAI API key"),
  geminiApiKey: z.string().default(process.env.GEMINI_API_KEY || '').describe("Google Gemini API key"),
  openrouterApiKey: z.string().default(process.env.OPENROUTER_API_KEY || '').describe("OpenRouter API key"),
  ollamaBaseUrl: z.string().default(process.env.OLLAMA_BASE_URL || 'http://localhost:11434').describe("Ollama base URL"),
});

// Types
interface ProfileData {
  author_profile_url: string;
  author_name?: string;
  post_details?: string;
  transcript?: string;
  authors_desc?: string;
  Company?: string;
  Job_title?: string;
  InteractionStatistic_followers?: string;
  email?: string;
  phone1?: string;
  phone2?: string;
  about_company?: string;
  post_summary?: string;
  transcript_summary?: string;
  author_activity?: string;
  profile_summary?: string;
}

interface SearchResult {
  url: string;
  title: string;
  abstract: string;
  source_query?: string;
}

interface ContactInfo {
  email?: string;
  phone1?: string;
  phone2?: string;
  about_company?: string;
  job_title?: string;
}

interface LocationData {
  type: string;
  name: string;
  search_code: string;
  priority: number;
  code?: string;
  country_code?: string;
}

class DatabaseManager {
  private profiles: ProfileData[] = [];
  private dbPath: string;

  constructor() {
    // Create Database directory if it doesn't exist
    const dbDir = path.join(process.cwd(), "Database");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.dbPath = path.join(dbDir, "profiles.json");
    this.loadProfiles();
  }

  private loadProfiles(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = fs.readFileSync(this.dbPath, 'utf8');
        this.profiles = JSON.parse(data);
      }
    } catch (error) {
      console.error("Error loading profiles:", error);
      this.profiles = [];
    }
  }

  private saveProfiles(): void {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.profiles, null, 2));
    } catch (error) {
      console.error("Error saving profiles:", error);
    }
  }

  saveProfile(profile: ProfileData): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Remove existing profile with same URL
        this.profiles = this.profiles.filter(p => p.author_profile_url !== profile.author_profile_url);
        
        // Add new profile
        this.profiles.push(profile);
        
        // Save to file
        this.saveProfiles();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  profileExists(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const exists = this.profiles.some(p => p.author_profile_url === url);
      resolve(exists);
    });
  }

  getAllProfiles(): Promise<ProfileData[]> {
    return new Promise((resolve) => {
      resolve([...this.profiles]);
    });
  }

  close(): void {
    // Save profiles one final time
    this.saveProfiles();
  }
}

class GoogleSearchEngine {
  private apiKey: string;
  private searchEngineId: string;

  constructor() {
    // Default API keys - these should be configurable
    this.apiKey = "AIzaSyBZJTIMzG6p-9XGatR0WXV-SZK8b1Y2pLU";
    this.searchEngineId = "45c3e4f9315f9456b";
  }

  async search(query: string, numResults: number = 10): Promise<SearchResult[]> {
    try {
      const results: SearchResult[] = [];
      const maxResultsPerRequest = 10;

      for (let start = 1; start <= Math.min(numResults, 100); start += maxResultsPerRequest) {
        const url = "https://www.googleapis.com/customsearch/v1";
        const params = {
          key: this.apiKey,
          cx: this.searchEngineId,
          q: query,
          num: Math.min(maxResultsPerRequest, numResults - results.length),
          start: start,
        };

        const response = await axios.get(url, { params });
        const items = response.data.items || [];

        for (const item of items) {
          results.push({
            url: item.link,
            title: item.title,
            abstract: item.snippet || "",
          });
        }

        if (items.length < maxResultsPerRequest) break;
        if (results.length >= numResults) break;
      }

      return results.slice(0, numResults);
    } catch (error) {
      console.error("Google search error:", error);
      return [];
    }
  }
}

class ApolloAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getPersonMatch(personName: string, companyName: string): Promise<ContactInfo> {
    try {
      const url = "https://api.apollo.io/api/v1/people/match";
      const params = {
        name: personName,
        organization_name: companyName,
        reveal_personal_emails: true,
        reveal_phone_number: false,
      };

      const headers = {
        accept: "application/json",
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      };

      const response = await axios.post(url, params, { headers });
      const personData = response.data;

      return {
        email: personData.person?.email,
        phone1: personData.person?.organization?.primary_phone?.number,
        phone2: personData.person?.organization?.sanitized_phone,
        about_company: personData.person?.organization?.short_description,
        job_title: personData.person?.title,
      };
    } catch (error) {
      console.error("Apollo API error:", error);
      return {};
    }
  }
}

class NubelaAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getProfileDetails(profileUrl: string): Promise<{ profile: ProfileData; rawData: string }> {
    try {
      const headers = { Authorization: `Bearer ${this.apiKey}` };
      const url = `https://nubela.co/proxycurl/api/v2/linkedin?linkedin_profile_url=${profileUrl}`;

      const response = await axios.get(url, { headers });
      const data = response.data;

      const profile: ProfileData = {
        author_profile_url: profileUrl,
        author_name: data.full_name,
        InteractionStatistic_followers: data.follower_count?.toString(),
        authors_desc: data.headline,
        Company: data.experiences?.[0]?.company,
        Job_title: data.experiences?.[0]?.title,
      };

      return { profile, rawData: JSON.stringify(data) };
    } catch (error) {
      console.error("Nubela API error:", error);
      return {
        profile: { author_profile_url: profileUrl },
        rawData: "",
      };
    }
  }
}

class LLMAPIWrapper {
  private openaiClient?: OpenAI;
  private config: z.infer<typeof configSchema>;

  constructor(config: z.infer<typeof configSchema>) {
    this.config = config;
    if (config.openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
    }
  }

  async generateSearchQueries(mainQuery: string, numQueries: number = 3): Promise<string[]> {
    if (!this.openaiClient) {
      return this.generateFallbackQueries(mainQuery, numQueries);
    }

    try {
      const prompt = `Generate ${numQueries} UNIQUE alternative search queries for finding LinkedIn profiles related to: "${mainQuery}"

IMPORTANT GUIDELINES:
- Focus ONLY on closely related roles (host, presenter, interviewer)
- Use AI-related terms: Artificial Intelligence, Machine Learning, Deep Learning, AI automation
- Always include "site:linkedin.com/in" in each query
- ONLY the word "podcast" should be in double quotes like "podcast"
- When using years, ONLY use 2022, 2023, 2024, or 2025

Return ONLY the queries, one per line, with no numbering or additional text.`;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });

      const queries = response.choices[0].message.content
        ?.split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0)
        .slice(0, numQueries) || [];

      return queries.length > 0 ? queries : this.generateFallbackQueries(mainQuery, numQueries);
    } catch (error) {
      console.error("LLM query generation error:", error);
      return this.generateFallbackQueries(mainQuery, numQueries);
    }
  }

  private generateFallbackQueries(mainQuery: string, numQueries: number): string[] {
    const locations = ["US", "UK", "CA", "AU", "NY"];
    const years = ["2022", "2023", "2024"];
    const roles = ["host", "presenter", "interviewer"];
    const aiTerms = ["AI", "Artificial Intelligence", "Machine Learning", "Deep Learning"];

    const queries: string[] = [];
    const baseQuery = "site:linkedin.com/in";

    for (let i = 0; i < numQueries; i++) {
      const loc = locations[i % locations.length];
      const role = roles[i % roles.length];
      const aiTerm = aiTerms[i % aiTerms.length];

      if (mainQuery.toLowerCase().includes("podcast")) {
        queries.push(`${baseQuery} ${aiTerm} "podcast" ${role} loc:${loc}`);
      } else {
        queries.push(`${baseQuery} ${mainQuery} ${role} loc:${loc}`);
      }
    }

    return queries;
  }

  async filterProfile(profile: SearchResult, query: string): Promise<boolean> {
    if (!this.openaiClient) {
      return true; // Accept all profiles if no LLM available
    }

    try {
      const prompt = `Is this LinkedIn profile relevant to the search query '${query}'?

Profile:
Title: ${profile.title}
Abstract: ${profile.abstract}
URL: ${profile.url}

Use APPROXIMATE MATCHING rather than requiring exact keyword matches.
Consider SEMANTIC RELEVANCE over literal text matching.
When in doubt, lean toward inclusion rather than exclusion.

Answer with only 'yes' or 'no'.`;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.0,
      });

      const result = response.choices[0].message.content?.toLowerCase().trim();
      return result === 'yes' || result?.startsWith('yes') || false;
    } catch (error) {
      console.error("LLM filtering error:", error);
      return true; // Accept by default on error
    }
  }

  async generateProfileSummary(profileData: any): Promise<string> {
    if (!this.openaiClient) {
      return this.generateFallbackSummary(profileData);
    }

    try {
      const prompt = `Generate a concise summary (maximum 150 characters) of this LinkedIn profile.
Focus on the person's current role, expertise, and key achievements.

Profile data:
${JSON.stringify(profileData, null, 2)}

Keep your summary professional and factual.`;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.0,
      });

      const summary = response.choices[0].message.content?.trim() || "";
      return summary.length > 150 ? summary.substring(0, 147) + "..." : summary;
    } catch (error) {
      console.error("LLM summary generation error:", error);
      return this.generateFallbackSummary(profileData);
    }
  }

  private generateFallbackSummary(profileData: any): string {
    const name = profileData.name || "";
    const headline = profileData.headline || "";
    const company = profileData.company || "";
    const title = profileData.title || "";

    if (headline) return `${name}: ${headline}`;
    if (title && company) return `${name}: ${title} at ${company}`;
    if (title) return `${name}: ${title}`;
    if (company) return `${name}: Works at ${company}`;
    return name;
  }
}

class ProfileExtractor {
  private config: z.infer<typeof configSchema>;
  public db: DatabaseManager;
  private searchEngine: GoogleSearchEngine;
  public apolloAPI?: ApolloAPI;
  private nubelaAPI?: NubelaAPI;
  public llmWrapper: LLMAPIWrapper;

  constructor(config: z.infer<typeof configSchema>) {
    this.config = config;
    this.db = new DatabaseManager();
    this.searchEngine = new GoogleSearchEngine();
    this.llmWrapper = new LLMAPIWrapper(config);

    if (config.apolloApiKey) {
      this.apolloAPI = new ApolloAPI(config.apolloApiKey);
    }

    if (config.nubelaApiKey) {
      this.nubelaAPI = new NubelaAPI(config.nubelaApiKey);
    }

    // Give database time to initialize
    setTimeout(() => {
      console.log("Database initialization complete");
    }, 1000);
  }

  async searchProfiles(keywords: string, numResults: number = 20): Promise<SearchResult[]> {
    const baseQuery = `site:linkedin.com/in "${keywords}"`;
    
    // Get main search results
    const mainResults = await this.searchEngine.search(baseQuery, Math.min(numResults, 30));
    
    // Generate additional queries using LLM
    const additionalQueries = await this.llmWrapper.generateSearchQueries(baseQuery, 3);
    
    const allResults: SearchResult[] = [...mainResults];
    const seenUrls = new Set(mainResults.map(r => r.url));

    // Search with additional queries
    for (const query of additionalQueries) {
      const results = await this.searchEngine.search(query, 15);
      for (const result of results) {
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          result.source_query = 'additional';
          allResults.push(result);
        }
      }
    }

    // Filter results using LLM
    const filteredResults: SearchResult[] = [];
    for (const result of allResults) {
      if (await this.llmWrapper.filterProfile(result, keywords)) {
        filteredResults.push(result);
      }
    }

    return filteredResults.slice(0, numResults);
  }

  async extractProfileFromUrl(url: string): Promise<ProfileData | null> {
    try {
      // Check if profile already exists
      if (await this.db.profileExists(url)) {
        console.log(`Profile already exists: ${url}`);
        return null;
      }

      // Try to extract using direct scraping first
      let profile = await this.extractWithScraping(url);
      
      // Fallback to Nubela if scraping fails
      if (!profile?.Company && this.nubelaAPI) {
        const nubelaResult = await this.nubelaAPI.getProfileDetails(url);
        profile = nubelaResult.profile;
      }

      if (!profile?.Company || !profile?.author_name) {
        console.log(`Insufficient profile data for: ${url}`);
        return null;
      }

      // Enrich with Apollo data
      if (this.apolloAPI && profile.author_name && profile.Company) {
        const contactInfo = await this.apolloAPI.getPersonMatch(profile.author_name, profile.Company);
        Object.assign(profile, contactInfo);
      }

      // Generate profile summary
      if (profile.authors_desc) {
        const profileData = {
          name: profile.author_name,
          headline: profile.authors_desc,
          company: profile.Company,
          title: profile.Job_title,
        };
        profile.profile_summary = await this.llmWrapper.generateProfileSummary(profileData);
      }

      return profile;
    } catch (error) {
      console.error(`Error extracting profile from ${url}:`, error);
      return null;
    }
  }

  private async extractWithScraping(url: string): Promise<ProfileData | null> {
    try {
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      };

      const normalizedUrl = this.normalizeUrl(url);
      const response = await axios.get(normalizedUrl, { headers, timeout: 10000 });

      if (response.status !== 200) {
        return null;
      }

      const $ = cheerio.load(response.data);
      const jsonLdScript = $('script[type="application/ld+json"]').first();

      if (!jsonLdScript.length) {
        return null;
      }

      const jsonData = JSON.parse(jsonLdScript.html() || "{}");
      const graph = jsonData["@graph"] || [];

      for (const item of graph) {
        if (item["@type"] === "Person") {
          const worksFor = item.worksFor || [];
          const company = worksFor[0]?.name;

          return {
            author_profile_url: url,
            author_name: item.name,
            authors_desc: item.description,
            Company: company,
            Job_title: item.jobTitle,
            InteractionStatistic_followers: item.interactionStatistic?.userInteractionCount?.toString(),
          };
        }
      }

      return null;
    } catch (error) {
      console.error("Scraping error:", error);
      return null;
    }
  }

  private normalizeUrl(url: string): string {
    if (!url.includes("https://www.")) {
      const parts = url.split(".");
      return "https://www." + parts.slice(1).join(".");
    }
    return url;
  }

  async processProfiles(searchResults: SearchResult[]): Promise<ProfileData[]> {
    const profiles: ProfileData[] = [];

    for (const result of searchResults) {
      const profile = await this.extractProfileFromUrl(result.url);
      if (profile) {
        await this.db.saveProfile(profile);
        profiles.push(profile);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return profiles;
  }

  async exportToCSV(filename?: string): Promise<string> {
    const profiles = await this.db.getAllProfiles();
    
    // Create Data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), "Data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const csvFilename = filename || `extracted_data_${new Date().toISOString().split('T')[0]}.csv`;
    const csvPath = path.join(dataDir, csvFilename);

    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'author_profile_url', title: 'Profile URL' },
        { id: 'author_name', title: 'Name' },
        { id: 'authors_desc', title: 'Description' },
        { id: 'Company', title: 'Company' },
        { id: 'Job_title', title: 'Job Title' },
        { id: 'InteractionStatistic_followers', title: 'Followers' },
        { id: 'email', title: 'Email' },
        { id: 'phone1', title: 'Phone 1' },
        { id: 'phone2', title: 'Phone 2' },
        { id: 'about_company', title: 'About Company' },
        { id: 'profile_summary', title: 'Profile Summary' },
      ],
    });

    await csvWriter.writeRecords(profiles);
    return csvPath;
  }

  close(): void {
    this.db.close();
  }
}

export default function createStatelessServer({
  config,
}: {
  config: z.infer<typeof configSchema>;
}) {
  const server = new McpServer({
    name: "LinkedIn Profile Data Mining Server",
    version: "1.0.0",
  });

  let extractor: ProfileExtractor | null = null;

  // Initialize extractor
  const getExtractor = () => {
    if (!extractor) {
      extractor = new ProfileExtractor(config);
    }
    return extractor;
  };

  // Define output schemas
  const SearchResultSchema = z.object({
    url: z.string().describe("LinkedIn profile URL"),
    title: z.string().describe("Profile title from search results"),
    abstract: z.string().describe("Profile description/snippet"),
    source_query: z.string().optional().describe("Source query that found this result"),
  });

  const ProfileDataSchema = z.object({
    author_profile_url: z.string().describe("LinkedIn profile URL"),
    author_name: z.string().optional().describe("Full name of the person"),
    post_details: z.string().optional().describe("Post details if available"),
    transcript: z.string().optional().describe("Transcript content if available"),
    authors_desc: z.string().optional().describe("Profile headline/description"),
    Company: z.string().optional().describe("Current company name"),
    Job_title: z.string().optional().describe("Current job title"),
    InteractionStatistic_followers: z.string().optional().describe("Number of followers"),
    email: z.string().optional().describe("Email address from Apollo API"),
    phone1: z.string().optional().describe("Primary phone number"),
    phone2: z.string().optional().describe("Secondary phone number"),
    about_company: z.string().optional().describe("Company description"),
    post_summary: z.string().optional().describe("Summary of posts"),
    transcript_summary: z.string().optional().describe("Summary of transcripts"),
    author_activity: z.string().optional().describe("Author activity information"),
    profile_summary: z.string().optional().describe("AI-generated profile summary"),
  });

  const ContactInfoSchema = z.object({
    email: z.string().optional().describe("Email address"),
    phone1: z.string().optional().describe("Primary phone number"),
    phone2: z.string().optional().describe("Secondary phone number"),
    about_company: z.string().optional().describe("Company description"),
    job_title: z.string().optional().describe("Job title"),
  });

  const SearchProfilesOutputSchema = z.object({
    success: z.boolean().describe("Whether the search was successful"),
    results_count: z.number().describe("Number of profiles found"),
    keywords: z.string().describe("Search keywords used"),
    profiles: z.array(SearchResultSchema).describe("Array of found LinkedIn profiles"),
    message: z.string().describe("Status message"),
  });

  const ExtractProfileOutputSchema = z.object({
    success: z.boolean().describe("Whether extraction was successful"),
    processed_count: z.number().describe("Number of profiles successfully processed"),
    profiles: z.array(ProfileDataSchema).describe("Array of extracted profile data"),
    message: z.string().describe("Status message"),
  });

  const MineDataOutputSchema = z.object({
    success: z.boolean().describe("Whether data mining was successful"),
    search_results_count: z.number().describe("Number of profiles found in search"),
    processed_count: z.number().describe("Number of profiles successfully processed"),
    csv_path: z.string().optional().describe("Path to exported CSV file"),
    profiles: z.array(ProfileDataSchema).describe("Array of mined profile data"),
    message: z.string().describe("Detailed status message"),
  });

  const ContactInfoOutputSchema = z.object({
    success: z.boolean().describe("Whether contact lookup was successful"),
    person_name: z.string().describe("Name of the person searched"),
    company_name: z.string().describe("Company name searched"),
    contact_info: ContactInfoSchema.describe("Found contact information"),
    message: z.string().describe("Status message"),
  });

  const ExportOutputSchema = z.object({
    success: z.boolean().describe("Whether export was successful"),
    file_path: z.string().describe("Path to the exported file"),
    profiles_count: z.number().describe("Number of profiles exported"),
    message: z.string().describe("Status message"),
  });

  const StoredProfilesOutputSchema = z.object({
    success: z.boolean().describe("Whether retrieval was successful"),
    profiles_count: z.number().describe("Number of stored profiles"),
    profiles: z.array(ProfileDataSchema).describe("Array of stored profile data"),
    message: z.string().describe("Status message"),
  });

  const GenerateQueriesOutputSchema = z.object({
    success: z.boolean().describe("Whether query generation was successful"),
    main_query: z.string().describe("Original query used for generation"),
    generated_count: z.number().describe("Number of queries generated"),
    queries: z.array(z.string()).describe("Array of generated search queries"),
    message: z.string().describe("Status message"),
  });

  const EnrichContactOutputSchema = z.object({
    success: z.boolean().describe("Whether contact enrichment was successful"),
    total_profiles: z.number().describe("Total number of profiles processed"),
    enriched_count: z.number().describe("Number of profiles successfully enriched"),
    enriched_profiles: z.array(ProfileDataSchema).describe("Array of enriched profile data"),
    message: z.string().describe("Status message"),
  });

  const ProfileDetailsOutputSchema = z.object({
    success: z.boolean().describe("Whether profile details retrieval was successful"),
    requested_count: z.number().describe("Number of profiles requested"),
    found_count: z.number().describe("Number of profiles found in database"),
    profiles: z.array(ProfileDataSchema).describe("Array of found profile data"),
    not_found_urls: z.array(z.string()).describe("URLs not found in database"),
    message: z.string().describe("Status message"),
  });

  const SearchByCriteriaOutputSchema = z.object({
    success: z.boolean().describe("Whether search by criteria was successful"),
    total_profiles: z.number().describe("Total number of profiles in database"),
    filtered_count: z.number().describe("Number of profiles matching criteria"),
    profiles: z.array(ProfileDataSchema).describe("Array of filtered profile data"),
    filters_applied: z.object({
      company: z.string().optional(),
      job_title: z.string().optional(),
      has_email: z.boolean().optional(),
      min_followers: z.number().optional(),
      keyword: z.string().optional(),
    }).describe("Filters that were applied"),
    message: z.string().describe("Status message"),
  });

  const StatisticsOutputSchema = z.object({
    success: z.boolean().describe("Whether statistics retrieval was successful"),
    statistics: z.object({
      total_profiles: z.number(),
      profiles_with_email: z.number(),
      profiles_with_phone: z.number(),
      profiles_with_company: z.number(),
      profiles_with_job_title: z.number(),
      unique_companies: z.number(),
      unique_job_titles: z.number(),
      avg_followers: z.number(),
    }).describe("Database statistics"),
    top_companies: z.array(z.tuple([z.string(), z.number()])).describe("Top companies by profile count"),
    message: z.string().describe("Status message"),
  });

  const ClearDatabaseOutputSchema = z.object({
    success: z.boolean().describe("Whether database clearing was successful"),
    cleared_count: z.number().describe("Number of profiles cleared"),
    message: z.string().describe("Status message"),
  });

  // Search for LinkedIn profiles
  server.tool(
    "search_linkedin_profiles",
    "Search for LinkedIn profiles based on keywords",
    {
      keywords: z.string().describe("Keywords to search for (e.g., 'AI podcast host')"),
      num_results: z.union([z.number(), z.string().transform(val => parseInt(val, 10))]).default(20).describe("Number of results to return"),
    },
    async ({ keywords, num_results }) => {
      try {
        const profileExtractor = getExtractor();
        const results = await profileExtractor.searchProfiles(keywords, num_results);
        
        const responseData = {
          success: true,
          results_count: results.length,
          keywords,
          profiles: results,
          message: `Successfully found ${results.length} LinkedIn profiles for "${keywords}"`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} LinkedIn profiles for "${keywords}":\n\n${results
                .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   Abstract: ${r.abstract}\n`)
                .join('\n')}`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          results_count: 0,
          keywords,
          profiles: [],
          message: `Error searching profiles: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error searching profiles: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Extract profile data from URLs
  server.tool(
    "extract_profile_data",
    "Extract detailed profile data from LinkedIn URLs",
    {
      urls: z.array(z.string()).describe("Array of LinkedIn profile URLs to extract data from"),
      include_contact_info: z.boolean().default(true).describe("Whether to include contact information via Apollo API"),
    },
    async ({ urls, include_contact_info }) => {
      try {
        const profileExtractor = getExtractor();
        const profiles: ProfileData[] = [];

        for (const url of urls) {
          const profile = await profileExtractor.extractProfileFromUrl(url);
          if (profile) {
            profiles.push(profile);
          }
        }

        const responseData = {
          success: true,
          processed_count: profiles.length,
          profiles,
          message: `Successfully extracted data from ${profiles.length} out of ${urls.length} profiles`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Extracted data from ${profiles.length} profiles:\n\n${profiles
                .map(p => `Name: ${p.author_name}\nCompany: ${p.Company}\nTitle: ${p.Job_title}\nEmail: ${p.email || 'N/A'}\nURL: ${p.author_profile_url}\n`)
                .join('\n')}`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          processed_count: 0,
          profiles: [],
          message: `Error extracting profile data: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error extracting profile data: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Comprehensive search and extract
  server.tool(
    "mine_linkedin_data",
    "Comprehensive LinkedIn data mining: search, extract, and enrich profile data",
    {
      keywords: z.string().describe("Keywords to search for"),
      num_results: z.number().default(20).describe("Number of profiles to process"),
      export_csv: z.boolean().default(true).describe("Whether to export results to CSV"),
      csv_filename: z.string().optional().describe("Custom CSV filename"),
    },
    async ({ keywords, num_results, export_csv, csv_filename }) => {
      try {
        const profileExtractor = getExtractor();
        
        // Step 1: Search for profiles
        const searchResults = await profileExtractor.searchProfiles(keywords, num_results);
        
        // Step 2: Extract and process profiles
        const profiles = await profileExtractor.processProfiles(searchResults);
        
        let csvPath = "";
        if (export_csv) {
          csvPath = await profileExtractor.exportToCSV(csv_filename);
        }

        const summary = `Data Mining Complete for "${keywords}":

📊 Search Results: ${searchResults.length} profiles found
✅ Successfully Processed: ${profiles.length} profiles
💾 Profiles Saved to Database: ${profiles.length}
${export_csv ? `📄 CSV Export: ${csvPath}` : ''}

Profile Summary:
${profiles.map((p, i) =>
  `${i + 1}. ${p.author_name} - ${p.Job_title || 'N/A'} at ${p.Company || 'N/A'}
     Email: ${p.email || 'N/A'}
     Followers: ${p.InteractionStatistic_followers || 'N/A'}
     URL: ${p.author_profile_url}`
).join('\n\n')}`;

        const responseData = {
          success: true,
          search_results_count: searchResults.length,
          processed_count: profiles.length,
          csv_path: export_csv ? csvPath : undefined,
          profiles,
          message: summary,
        };

        return {
          content: [
            {
              type: "text",
              text: summary,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          search_results_count: 0,
          processed_count: 0,
          csv_path: undefined,
          profiles: [],
          message: `Error in data mining process: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error in data mining process: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Get Apollo contact information
  server.tool(
    "get_contact_info",
    "Get contact information for a person using Apollo API",
    {
      person_name: z.string().describe("Full name of the person"),
      company_name: z.string().describe("Company name where the person works"),
    },
    async ({ person_name, company_name }) => {
      try {
        if (!config.apolloApiKey) {
          const responseData = {
            success: false,
            person_name,
            company_name,
            contact_info: {},
            message: "Apollo API key not configured. Please provide apolloApiKey in the configuration.",
          };

          return {
            content: [
              {
                type: "text",
                text: "Apollo API key not configured. Please provide apolloApiKey in the configuration.",
              },
            ],
            structuredContent: responseData,
          };
        }

        const apollo = new ApolloAPI(config.apolloApiKey);
        const contactInfo = await apollo.getPersonMatch(person_name, company_name);

        const responseData = {
          success: true,
          person_name,
          company_name,
          contact_info: contactInfo,
          message: `Successfully retrieved contact information for ${person_name} at ${company_name}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Contact information for ${person_name} at ${company_name}:
              
Email: ${contactInfo.email || 'Not found'}
Phone 1: ${contactInfo.phone1 || 'Not found'}
Phone 2: ${contactInfo.phone2 || 'Not found'}
Job Title: ${contactInfo.job_title || 'Not found'}
About Company: ${contactInfo.about_company || 'Not found'}`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          person_name,
          company_name,
          contact_info: {},
          message: `Error getting contact info: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error getting contact info: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Export data to CSV
  server.tool(
    "export_to_csv",
    "Export all stored profile data to CSV file",
    {
      filename: z.string().optional().describe("Custom filename for the CSV export"),
    },
    async ({ filename }) => {
      try {
        const profileExtractor = getExtractor();
        const profiles = await profileExtractor.db.getAllProfiles();
        const csvPath = await profileExtractor.exportToCSV(filename);
        
        const responseData = {
          success: true,
          file_path: csvPath,
          profiles_count: profiles.length,
          message: `Successfully exported ${profiles.length} profiles to: ${csvPath}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Data exported successfully to: ${csvPath}`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          file_path: "",
          profiles_count: 0,
          message: `Error exporting data: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error exporting data: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Get all stored profiles
  server.tool(
    "get_stored_profiles",
    "Retrieve all profiles stored in the database",
    {},
    async () => {
      try {
        const profileExtractor = getExtractor();
        const profiles = await profileExtractor.db.getAllProfiles();
        
        const responseData = {
          success: true,
          profiles_count: profiles.length,
          profiles,
          message: `Successfully retrieved ${profiles.length} stored profiles from database`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Found ${profiles.length} stored profiles:\n\n${profiles
                .map((p, i) => `${i + 1}. ${p.author_name} - ${p.Job_title || 'N/A'} at ${p.Company || 'N/A'}\n   Email: ${p.email || 'N/A'}\n   URL: ${p.author_profile_url}\n`)
                .join('\n')}`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          profiles_count: 0,
          profiles: [],
          message: `Error retrieving profiles: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error retrieving profiles: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Generate search queries using LLM
  server.tool(
    "generate_search_queries",
    "Generate additional search queries for LinkedIn profile mining using AI",
    {
      main_query: z.string().describe("Main search query to expand"),
      num_queries: z.number().default(3).describe("Number of additional queries to generate"),
    },
    async ({ main_query, num_queries }) => {
      try {
        const profileExtractor = getExtractor();
        const queries = await profileExtractor.llmWrapper.generateSearchQueries(main_query, num_queries);
        
        const responseData = {
          success: true,
          main_query,
          generated_count: queries.length,
          queries,
          message: `Successfully generated ${queries.length} additional search queries for "${main_query}"`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Generated ${queries.length} additional search queries for "${main_query}":\n\n${queries
                .map((q, i) => `${i + 1}. ${q}`)
                .join('\n')}`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          main_query,
          generated_count: 0,
          queries: [],
          message: `Error generating queries: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error generating queries: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Enrich contact information for existing profiles
  server.tool(
    "enrich_contact_info",
    "Enrich existing profiles with contact information using Apollo API",
    {
      profile_urls: z.array(z.string()).optional().describe("Specific profile URLs to enrich (if not provided, enriches all stored profiles)"),
    },
    async ({ profile_urls }) => {
      try {
        const profileExtractor = getExtractor();
        const allProfiles = await profileExtractor.db.getAllProfiles();
        
        let profilesToEnrich = allProfiles;
        if (profile_urls && profile_urls.length > 0) {
          profilesToEnrich = allProfiles.filter(p => profile_urls.includes(p.author_profile_url));
        }

        let enrichedCount = 0;
        const enrichedProfiles: ProfileData[] = [];

        for (const profile of profilesToEnrich) {
          if (profile.author_name && profile.Company && profileExtractor.apolloAPI) {
            const contactInfo = await profileExtractor.apolloAPI.getPersonMatch(profile.author_name, profile.Company);
            if (contactInfo.email || contactInfo.phone1) {
              Object.assign(profile, contactInfo);
              await profileExtractor.db.saveProfile(profile);
              enrichedProfiles.push(profile);
              enrichedCount++;
            }
          }
        }

        const responseData = {
          success: true,
          total_profiles: profilesToEnrich.length,
          enriched_count: enrichedCount,
          enriched_profiles: enrichedProfiles,
          message: `Successfully enriched ${enrichedCount} out of ${profilesToEnrich.length} profiles with contact information`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Contact enrichment complete:\n\n✅ Enriched: ${enrichedCount} profiles\n📊 Total processed: ${profilesToEnrich.length} profiles\n\nEnriched profiles:\n${enrichedProfiles.map((p, i) => `${i + 1}. ${p.author_name} - ${p.email || 'No email'}`).join('\n')}`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          total_profiles: 0,
          enriched_count: 0,
          enriched_profiles: [],
          message: `Error enriching contact info: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error enriching contact info: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Get detailed profile information
  server.tool(
    "get_profile_details",
    "Get detailed information for specific LinkedIn profiles",
    {
      profile_urls: z.array(z.string()).describe("Array of LinkedIn profile URLs to get details for"),
    },
    async ({ profile_urls }) => {
      try {
        const profileExtractor = getExtractor();
        const allProfiles = await profileExtractor.db.getAllProfiles();
        
        const requestedProfiles = allProfiles.filter(p => profile_urls.includes(p.author_profile_url));
        const foundUrls = requestedProfiles.map(p => p.author_profile_url);
        const notFoundUrls = profile_urls.filter(url => !foundUrls.includes(url));

        const responseData = {
          success: true,
          requested_count: profile_urls.length,
          found_count: requestedProfiles.length,
          profiles: requestedProfiles,
          not_found_urls: notFoundUrls,
          message: `Found ${requestedProfiles.length} out of ${profile_urls.length} requested profiles`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Profile Details (${requestedProfiles.length} found):\n\n${requestedProfiles.map((p, i) =>
                `${i + 1}. ${p.author_name || 'Unknown'}\n   Company: ${p.Company || 'N/A'}\n   Title: ${p.Job_title || 'N/A'}\n   Email: ${p.email || 'N/A'}\n   Followers: ${p.InteractionStatistic_followers || 'N/A'}\n   Description: ${p.authors_desc || 'N/A'}\n   URL: ${p.author_profile_url}\n`
              ).join('\n')}${notFoundUrls.length > 0 ? `\nNot found in database:\n${notFoundUrls.map(url => `- ${url}`).join('\n')}` : ''}`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          requested_count: profile_urls.length,
          found_count: 0,
          profiles: [],
          not_found_urls: profile_urls,
          message: `Error getting profile details: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error getting profile details: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Search profiles by criteria
  server.tool(
    "search_profiles_by_criteria",
    "Search stored profiles by specific criteria (company, job title, etc.)",
    {
      company: z.string().optional().describe("Filter by company name"),
      job_title: z.string().optional().describe("Filter by job title"),
      has_email: z.boolean().optional().describe("Filter profiles that have email addresses"),
      min_followers: z.number().optional().describe("Minimum number of followers"),
      keyword: z.string().optional().describe("Search in name, description, or company"),
    },
    async ({ company, job_title, has_email, min_followers, keyword }) => {
      try {
        const profileExtractor = getExtractor();
        let profiles = await profileExtractor.db.getAllProfiles();
        
        // Apply filters
        if (company) {
          profiles = profiles.filter(p => p.Company?.toLowerCase().includes(company.toLowerCase()));
        }
        
        if (job_title) {
          profiles = profiles.filter(p => p.Job_title?.toLowerCase().includes(job_title.toLowerCase()));
        }
        
        if (has_email !== undefined) {
          profiles = profiles.filter(p => has_email ? !!p.email : !p.email);
        }
        
        if (min_followers !== undefined) {
          profiles = profiles.filter(p => {
            const followers = parseInt(p.InteractionStatistic_followers || '0');
            return followers >= min_followers;
          });
        }
        
        if (keyword) {
          const searchTerm = keyword.toLowerCase();
          profiles = profiles.filter(p =>
            p.author_name?.toLowerCase().includes(searchTerm) ||
            p.authors_desc?.toLowerCase().includes(searchTerm) ||
            p.Company?.toLowerCase().includes(searchTerm)
          );
        }

        const responseData = {
          success: true,
          total_profiles: (await profileExtractor.db.getAllProfiles()).length,
          filtered_count: profiles.length,
          profiles,
          filters_applied: { company, job_title, has_email, min_followers, keyword },
          message: `Found ${profiles.length} profiles matching the specified criteria`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Search Results (${profiles.length} profiles found):\n\nFilters applied:\n${company ? `- Company: ${company}\n` : ''}${job_title ? `- Job Title: ${job_title}\n` : ''}${has_email !== undefined ? `- Has Email: ${has_email}\n` : ''}${min_followers !== undefined ? `- Min Followers: ${min_followers}\n` : ''}${keyword ? `- Keyword: ${keyword}\n` : ''}\n${profiles.map((p, i) =>
                `${i + 1}. ${p.author_name} - ${p.Job_title || 'N/A'} at ${p.Company || 'N/A'}\n   Email: ${p.email || 'N/A'}\n   Followers: ${p.InteractionStatistic_followers || 'N/A'}\n   URL: ${p.author_profile_url}\n`
              ).join('\n')}`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          total_profiles: 0,
          filtered_count: 0,
          profiles: [],
          filters_applied: { company, job_title, has_email, min_followers, keyword },
          message: `Error searching profiles: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error searching profiles: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Get search statistics
  server.tool(
    "get_search_statistics",
    "Get statistics about stored profiles and search performance",
    {},
    async () => {
      try {
        const profileExtractor = getExtractor();
        const profiles = await profileExtractor.db.getAllProfiles();
        
        const stats = {
          total_profiles: profiles.length,
          profiles_with_email: profiles.filter(p => !!p.email).length,
          profiles_with_phone: profiles.filter(p => !!p.phone1 || !!p.phone2).length,
          profiles_with_company: profiles.filter(p => !!p.Company).length,
          profiles_with_job_title: profiles.filter(p => !!p.Job_title).length,
          unique_companies: [...new Set(profiles.map(p => p.Company).filter(Boolean))].length,
          unique_job_titles: [...new Set(profiles.map(p => p.Job_title).filter(Boolean))].length,
          avg_followers: profiles.length > 0 ? Math.round(profiles.reduce((sum, p) => sum + parseInt(p.InteractionStatistic_followers || '0'), 0) / profiles.length) : 0,
        };

        const topCompanies = profiles
          .filter(p => p.Company)
          .reduce((acc, p) => {
            acc[p.Company!] = (acc[p.Company!] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

        const topCompaniesArray = Object.entries(topCompanies)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5);

        const responseData = {
          success: true,
          statistics: stats,
          top_companies: topCompaniesArray,
          message: `Database contains ${stats.total_profiles} profiles with comprehensive statistics`,
        };

        return {
          content: [
            {
              type: "text",
              text: `📊 Profile Database Statistics:\n\n🔢 Total Profiles: ${stats.total_profiles}\n📧 With Email: ${stats.profiles_with_email} (${Math.round(stats.profiles_with_email/stats.total_profiles*100)}%)\n📱 With Phone: ${stats.profiles_with_phone} (${Math.round(stats.profiles_with_phone/stats.total_profiles*100)}%)\n🏢 With Company: ${stats.profiles_with_company} (${Math.round(stats.profiles_with_company/stats.total_profiles*100)}%)\n💼 With Job Title: ${stats.profiles_with_job_title} (${Math.round(stats.profiles_with_job_title/stats.total_profiles*100)}%)\n\n🏢 Unique Companies: ${stats.unique_companies}\n💼 Unique Job Titles: ${stats.unique_job_titles}\n👥 Average Followers: ${stats.avg_followers}\n\n🔝 Top Companies:\n${topCompaniesArray.map(([company, count], i) => `${i + 1}. ${company}: ${count} profiles`).join('\n')}`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          statistics: {},
          top_companies: [],
          message: `Error getting statistics: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error getting statistics: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Clear database
  server.tool(
    "clear_database",
    "Clear all stored profile data from the database",
    {
      confirm: z.boolean().describe("Confirmation flag - must be true to proceed with clearing"),
    },
    async ({ confirm }) => {
      try {
        if (!confirm) {
          const responseData = {
            success: false,
            cleared_count: 0,
            message: "Database clear cancelled - confirmation flag must be set to true",
          };

          return {
            content: [
              {
                type: "text",
                text: "⚠️ Database clear cancelled. Set confirm=true to proceed with clearing all profile data.",
              },
            ],
            structuredContent: responseData,
          };
        }

        const profileExtractor = getExtractor();
        const profiles = await profileExtractor.db.getAllProfiles();
        const profileCount = profiles.length;
        
        // Clear the database by saving an empty array
        profileExtractor.db['profiles'] = [];
        profileExtractor.db['saveProfiles']();

        const responseData = {
          success: true,
          cleared_count: profileCount,
          message: `Successfully cleared ${profileCount} profiles from the database`,
        };

        return {
          content: [
            {
              type: "text",
              text: `🗑️ Database cleared successfully!\n\n📊 Removed: ${profileCount} profiles\n✅ Database is now empty`,
            },
          ],
          structuredContent: responseData,
        };
      } catch (error) {
        const responseData = {
          success: false,
          cleared_count: 0,
          message: `Error clearing database: ${error instanceof Error ? error.message : String(error)}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Error clearing database: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          structuredContent: responseData,
        };
      }
    }
  );

  // Clean up resources on server shutdown
  process.on('SIGINT', () => {
    if (extractor) {
      extractor.close();
    }
  });

  process.on('SIGTERM', () => {
    if (extractor) {
      extractor.close();
    }
  });

  return server.server;
}
