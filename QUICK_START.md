# 🚀 Quick Start Guide

Get the LinkedIn Profile Data Mining MCP Server running in 5 minutes!

## Step 1: Get Your API Keys (2 minutes)

### Required Keys:
1. **Apollo.io API Key** 
   - Go to [apollo.io](https://apollo.io) → Sign up → Settings → Integrations → Generate API Key
   
2. **OpenAI API Key**
   - Go to [platform.openai.com](https://platform.openai.com) → Sign up → API Keys → Create new secret key

## Step 2: Configure the Server (1 minute)

```bash
# Navigate to the server directory
cd smithery-servers/profile-searcher

# Copy the example configuration
cp .env.example .env

# Edit the .env file with your API keys
nano .env
```

Add your keys to the `.env` file:
```env
APOLLO_API_KEY=your_apollo_key_here
OPENAI_API_KEY=sk-your_openai_key_here
```

## Step 3: Start the Server (30 seconds)

```bash
# Install dependencies (if not already done)
npm install

# Start the development server
npm run dev
```

## Step 4: Test It Works (1 minute)

The server should start on port 8181. You can now use it with Claude Desktop or any MCP client!

### Example Usage:
- **Search for profiles**: "Find AI engineers on LinkedIn"
- **Extract contact info**: "Get contact information for these LinkedIn profiles"
- **Export data**: "Export all found profiles to CSV"

## For Claude Desktop Users

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "profile-searcher": {
      "command": "node",
      "args": ["/Users/amankale/Desktop/MCPs/smithery-servers/profile-searcher/dist/index.js"],
      "env": {
        "APOLLO_API_KEY": "your_apollo_key_here",
        "OPENAI_API_KEY": "sk-your_openai_key_here"
      }
    }
  }
}
```

## 🎉 You're Ready!

The server now has access to:
- ✅ LinkedIn profile search
- ✅ Contact information extraction
- ✅ AI-powered query generation
- ✅ CSV export functionality
- ✅ Database storage

## Need Help?

- 📖 Full documentation: [README.md](./README.md)
- ⚙️ Detailed configuration: [CONFIGURATION.md](./CONFIGURATION.md)
- 🐛 Issues? Check the troubleshooting section in CONFIGURATION.md

## Pro Tips:

1. **Start with small searches** (5-10 profiles) to test your setup
2. **Monitor your API usage** - Apollo.io has rate limits
3. **Enable debug mode** (`DEBUG=true`) if you encounter issues
4. **Export to CSV** regularly to backup your data

Happy data mining! 🔍📊