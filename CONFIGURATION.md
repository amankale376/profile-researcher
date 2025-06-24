# API Keys Configuration Guide

This guide explains exactly where and how to configure your API keys for the LinkedIn Profile Data Mining MCP Server.

## Method 1: Environment Variables (Recommended)

### Step 1: Create .env file
```bash
cd smithery-servers/profile-searcher
cp .env.example .env
```

### Step 2: Edit .env file with your API keys
```bash
# Open .env file in your editor
nano .env
# or
code .env
```

### Step 3: Add your API keys to .env
```env
APOLLO_API_KEY=your_actual_apollo_key_here
OPENAI_API_KEY=sk-your_actual_openai_key_here
NUBELA_API_KEY=your_actual_nubela_key_here
```

## Method 2: MCP Client Configuration

If you're using Claude Desktop or another MCP client, add the configuration to your MCP settings:

### For Claude Desktop:
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "profile-searcher": {
      "command": "node",
      "args": ["/path/to/smithery-servers/profile-searcher/dist/index.js"],
      "env": {
        "APOLLO_API_KEY": "your_apollo_api_key_here",
        "OPENAI_API_KEY": "sk-your_openai_api_key_here",
        "NUBELA_API_KEY": "your_nubela_api_key_here",
        "DEBUG": "false"
      }
    }
  }
}
```

### For Smithery Cloud:
When deploying to Smithery, set environment variables in the deployment dashboard:

1. Go to [Smithery Dashboard](https://smithery.ai)
2. Deploy your server
3. In the Environment Variables section, add:
   - `APOLLO_API_KEY`: your_apollo_key
   - `OPENAI_API_KEY`: your_openai_key
   - `NUBELA_API_KEY`: your_nubela_key

## Required API Keys

### 1. Apollo.io API Key (REQUIRED)
- **Purpose**: Contact information (emails, phone numbers)
- **Get it from**: https://apollo.io/settings/integrations
- **Steps**:
  1. Sign up at Apollo.io
  2. Go to Settings → Integrations
  3. Generate API key
  4. Copy the key to your configuration

### 2. OpenAI API Key (REQUIRED)
- **Purpose**: AI-powered query generation and profile summarization
- **Get it from**: https://platform.openai.com/api-keys
- **Steps**:
  1. Sign up at OpenAI Platform
  2. Go to API Keys section
  3. Create new secret key
  4. Copy the key (starts with `sk-`)

## Optional API Keys

### 3. Nubela Proxycurl API Key (OPTIONAL)
- **Purpose**: Fallback for LinkedIn profile extraction
- **Get it from**: https://nubela.co/proxycurl/
- **Note**: Only needed if direct LinkedIn scraping fails

### 4. Google Gemini API Key (OPTIONAL)
- **Purpose**: Alternative to OpenAI for AI features
- **Get it from**: https://makersuite.google.com/app/apikey

### 5. OpenRouter API Key (OPTIONAL)
- **Purpose**: Access to multiple LLM models
- **Get it from**: https://openrouter.ai/keys

## Testing Your Configuration

After setting up your API keys, test the server:

```bash
# Start the development server
npm run dev

# In another terminal, test a simple search
curl -X POST http://localhost:8181 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search_linkedin_profiles",
      "arguments": {
        "keywords": "AI engineer",
        "num_results": 5
      }
    },
    "id": 1
  }'
```

## Troubleshooting

### Common Issues:

1. **"API key not found" error**
   - Check that your .env file is in the correct directory
   - Verify the API key format (no extra spaces or quotes)

2. **"Invalid API key" error**
   - Verify the API key is active and has proper permissions
   - Check if you've exceeded API rate limits

3. **"Module not found" error**
   - Run `npm install` to ensure all dependencies are installed

### Debug Mode:
Enable debug logging by setting `DEBUG=true` in your configuration to see detailed API calls and responses.

## Security Notes

- Never commit your `.env` file to version control
- Keep your API keys secure and rotate them regularly
- Monitor your API usage to avoid unexpected charges
- Use environment-specific keys for development vs production