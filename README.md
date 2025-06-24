# LinkedIn Profile Data Mining MCP Server

A comprehensive Model Context Protocol (MCP) server for LinkedIn profile data mining, search, and contact information enrichment. This server integrates all the powerful features from the original data mining tool into an MCP-compatible interface.

## Features

### 🔍 **Advanced Search Capabilities**
- **Google Search Integration**: Uses Google Custom Search API for LinkedIn profile discovery
- **AI-Powered Query Expansion**: Generates additional search queries using OpenAI GPT-4o mini
- **Smart Filtering**: AI-based relevance filtering to ensure high-quality results
- **Location-Based Search**: Supports global location targeting for comprehensive coverage

### 📊 **Profile Data Extraction**
- **Direct LinkedIn Scraping**: Extracts profile data directly from LinkedIn pages
- **Nubela Proxycurl Fallback**: Uses Nubela API when direct scraping fails
- **Structured Data Parsing**: Extracts JSON-LD structured data from LinkedIn profiles
- **Comprehensive Profile Fields**: Name, company, job title, description, followers, etc.

### 📞 **Contact Information Enrichment**
- **Apollo.io Integration**: Enriches profiles with email addresses and phone numbers
- **Company Information**: Retrieves detailed company descriptions and contact details
- **Professional Validation**: Ensures contact information accuracy through API validation

### 🤖 **AI-Powered Features**
- **Profile Summarization**: Generates concise professional summaries using AI
- **Relevance Scoring**: AI-based filtering to match search intent
- **Query Optimization**: Intelligent search query generation and expansion
- **Multiple LLM Support**: OpenAI, Gemini, OpenRouter, and Ollama compatibility

### 💾 **Data Management**
- **SQLite Database**: Persistent storage for all extracted profiles
- **CSV Export**: Easy data export for analysis and CRM integration
- **Duplicate Prevention**: Automatic detection and prevention of duplicate profiles
- **Data Validation**: Ensures data quality and completeness

## Installation

1. **Clone or navigate to the server directory:**
   ```bash
   cd smithery-servers/profile-searcher
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure API keys:**
   ```bash
   # Copy the example configuration file
   cp .env.example .env
   
   # Edit .env with your API keys
   nano .env  # or use your preferred editor
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

## 🔑 API Keys Configuration

**📋 See [CONFIGURATION.md](./CONFIGURATION.md) for detailed setup instructions**

### Quick Setup:
1. **Required**: Apollo.io API key → Get from [apollo.io/settings/integrations](https://apollo.io/settings/integrations)
2. **Required**: OpenAI API key → Get from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
3. **Optional**: Nubela API key → Get from [nubela.co/proxycurl](https://nubela.co/proxycurl/)

### Environment Variables (.env file):
```env
APOLLO_API_KEY=your_apollo_api_key_here
OPENAI_API_KEY=sk-your_openai_api_key_here
NUBELA_API_KEY=your_nubela_api_key_here
DEBUG=false
```

### For Claude Desktop (claude_desktop_config.json):
```json
{
  "mcpServers": {
    "profile-searcher": {
      "command": "node",
      "args": ["/path/to/smithery-servers/profile-searcher/dist/index.js"],
      "env": {
        "APOLLO_API_KEY": "your_apollo_api_key_here",
        "OPENAI_API_KEY": "sk-your_openai_api_key_here"
      }
    }
  }
}
```

## Available Tools

### 1. `search_linkedin_profiles`
Search for LinkedIn profiles based on keywords.

**Parameters:**
- `keywords` (string): Search keywords (e.g., "AI podcast host")
- `num_results` (number): Number of results to return (default: 20)

**Example:**
```json
{
  "keywords": "AI podcast host",
  "num_results": 10
}
```

### 2. `extract_profile_data`
Extract detailed profile data from LinkedIn URLs.

**Parameters:**
- `urls` (array): Array of LinkedIn profile URLs
- `include_contact_info` (boolean): Whether to include contact info (default: true)

**Example:**
```json
{
  "urls": [
    "https://www.linkedin.com/in/example-profile",
    "https://www.linkedin.com/in/another-profile"
  ],
  "include_contact_info": true
}
```

### 3. `mine_linkedin_data`
Comprehensive data mining: search, extract, and enrich profile data.

**Parameters:**
- `keywords` (string): Keywords to search for
- `num_results` (number): Number of profiles to process (default: 20)
- `export_csv` (boolean): Whether to export to CSV (default: true)
- `csv_filename` (string, optional): Custom CSV filename

**Example:**
```json
{
  "keywords": "blockchain developer",
  "num_results": 25,
  "export_csv": true,
  "csv_filename": "blockchain_developers.csv"
}
```

### 4. `get_contact_info`
Get contact information for a specific person using Apollo API.

**Parameters:**
- `person_name` (string): Full name of the person
- `company_name` (string): Company where the person works

**Example:**
```json
{
  "person_name": "John Smith",
  "company_name": "Tech Corp"
}
```

### 5. `export_to_csv`
Export all stored profile data to CSV file.

**Parameters:**
- `filename` (string, optional): Custom filename for export

**Example:**
```json
{
  "filename": "all_profiles_export.csv"
}
```

### 6. `get_stored_profiles`
Retrieve all profiles stored in the database.

**Parameters:** None

### 7. `generate_search_queries`
Generate additional search queries using AI.

**Parameters:**
- `main_query` (string): Main search query to expand
- `num_queries` (number): Number of additional queries (default: 3)

**Example:**
```json
{
  "main_query": "site:linkedin.com/in AI podcast host",
  "num_queries": 5
}
```

## Data Structure

### Profile Data Fields

Each extracted profile contains the following fields:

```typescript
interface ProfileData {
  author_profile_url: string;           // LinkedIn profile URL
  author_name?: string;                 // Full name
  authors_desc?: string;                // Profile headline/description
  Company?: string;                     // Current company
  Job_title?: string;                   // Current job title
  InteractionStatistic_followers?: string; // Follower count
  email?: string;                       // Email address (from Apollo)
  phone1?: string;                      // Primary phone (from Apollo)
  phone2?: string;                      // Secondary phone (from Apollo)
  about_company?: string;               // Company description (from Apollo)
  profile_summary?: string;             // AI-generated summary
  post_details?: string;                // Recent post content
  transcript?: string;                  // Podcast/video transcripts
  post_summary?: string;                // AI summary of posts
  transcript_summary?: string;          // AI summary of transcripts
  author_activity?: string;             // Activity summary
}
```

## Database Schema

The server uses SQLite with three main tables:

1. **`author_urls_table`**: Stores complete profile information
2. **`validated_profiles`**: Tracks AI validation results
3. **`search_queries`**: Stores search queries and results

## File Structure

```
smithery-servers/profile-searcher/
├── src/
│   └── index.ts              # Main server implementation
├── package.json              # Dependencies and scripts
├── README.md                 # This documentation
├── smithery.yaml            # Smithery configuration
├── Database/                # SQLite database files
│   └── author_profile_.db   # Main database
└── Data/                    # CSV export files
    └── *.csv               # Exported profile data
```

## Usage Examples

### Basic Profile Search
```javascript
// Search for AI podcast hosts
const result = await mcpClient.callTool("search_linkedin_profiles", {
  keywords: "AI podcast host",
  num_results: 15
});
```

### Comprehensive Data Mining
```javascript
// Mine data for blockchain developers
const result = await mcpClient.callTool("mine_linkedin_data", {
  keywords: "blockchain developer",
  num_results: 30,
  export_csv: true,
  csv_filename: "blockchain_talent.csv"
});
```

### Contact Information Lookup
```javascript
// Get contact info for a specific person
const result = await mcpClient.callTool("get_contact_info", {
  person_name: "Jane Doe",
  company_name: "AI Innovations Inc"
});
```

## Rate Limiting and Best Practices

1. **Respect Rate Limits**: The server includes built-in delays between requests
2. **API Key Management**: Keep your API keys secure and monitor usage
3. **Data Privacy**: Ensure compliance with data protection regulations
4. **Ethical Use**: Use the tool responsibly and respect LinkedIn's terms of service

## Troubleshooting

### Common Issues

1. **Missing Dependencies**: Run `npm install` to ensure all packages are installed
2. **API Key Errors**: Verify all required API keys are correctly configured
3. **Database Permissions**: Ensure write permissions for the Database directory
4. **Network Issues**: Check internet connectivity for API calls

### Debug Mode

Enable debug mode in configuration for detailed logging:
```json
{
  "debug": true
}
```

## Contributing

This server is based on the comprehensive data mining tool and includes all its advanced features. For improvements or bug reports, please refer to the original implementation.

## License

ISC License - See package.json for details.

## Disclaimer

This tool is for legitimate business and research purposes. Users are responsible for complying with LinkedIn's terms of service, data protection regulations, and applicable laws. Always respect privacy and obtain necessary permissions before collecting personal data.