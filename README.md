# Slack GPT Bot Setup

A Slack bot that connects to OpenAI's Chat Completions API, allowing users to interact with your custom GPT through Slack.

## Features

- **AI Agent Side Panel** - Users can chat with your GPT in Slack's side-by-side view (sparkle icon ✨)
- Responds to @mentions in channels
- Handles direct messages
- Maintains conversation context in threads
- Verifies Slack request signatures for security
- Ready to deploy on Render

## Setup Steps

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From an app manifest"
3. Select your workspace
4. Paste this manifest:

```json
{
    "display_information": {
        "name": "Your Bot Name"
    },
    "features": {
        "app_home": {
            "home_tab_enabled": true,
            "messages_tab_enabled": true,
            "messages_tab_read_only_enabled": false
        },
        "bot_user": {
            "display_name": "Your Bot Name",
            "always_online": true
        },
        "assistant_view": {
            "assistant_description": "Your bot description",
            "suggested_prompts": []
        }
    },
    "oauth_config": {
        "scopes": {
            "bot": [
                "app_mentions:read",
                "assistant:write",
                "chat:write",
                "im:history",
                "im:write",
                "users:read",
                "channels:history"
            ]
        }
    },
    "settings": {
        "event_subscriptions": {
            "request_url": "https://your-app.onrender.com/slack/events",
            "bot_events": [
                "app_home_opened",
                "app_mention",
                "assistant_thread_started",
                "message.im"
            ]
        },
        "interactivity": {
            "is_enabled": true,
            "request_url": "https://your-app.onrender.com/slack/events"
        },
        "org_deploy_enabled": false,
        "socket_mode_enabled": false,
        "token_rotation_enabled": false
    }
}
```

5. Create the app

### 2. Get Your Tokens

**Bot User OAuth Token:**
1. Go to **OAuth & Permissions**
2. Click "Install to Workspace"
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

**Signing Secret:**
1. Go to **Basic Information**
2. Under **App Credentials**, find your **Signing Secret**

### 3. Get Your OpenAI API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new secret key
3. Save it securely

### 4. Deploy to Render

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect this GitHub repo: `karibluedogdesign/slack-gpt-bot`
4. Configure:
   - **Name**: `slack-gpt-bot`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `SLACK_BOT_TOKEN` = Your Bot User OAuth Token (xoxb-...)
     - `SLACK_SIGNING_SECRET` = Your Signing Secret
     - `OPENAI_API_KEY` = Your OpenAI API key

5. Click "Create Web Service"

### 5. Update Slack Event URL

Once Render deploys (takes ~2 minutes):
1. Copy your Render app URL (e.g., `https://slack-gpt-bot-xxxx.onrender.com`)
2. Go back to your Slack app's **Event Subscriptions**
3. Update the Request URL to: `https://your-app.onrender.com/slack/events`
4. Slack will verify the URL (you'll see a green checkmark)

### 6. Enable AI Agent in Slack

1. Go to your Slack app's **Agents & AI Apps** section
2. Turn on the "Agent or Assistant" toggle
3. Done! The sparkle icon ✨ will appear in your Slack workspace

### 7. Customize Your GPT

Edit `server.js` in this repo and replace the `SYSTEM_PROMPT`:

```javascript
const SYSTEM_PROMPT = `Your custom GPT instructions here...`;
```

Commit and push - Render will auto-deploy.

## Usage

### AI Agent Side Panel (Recommended)
1. Click the sparkle icon ✨ in the top-right corner of Slack
2. Or click the app name in the Slack sidebar (under "Apps")
3. Start chatting directly - no @mentions needed!
4. Conversations are private and maintained in the side panel

### In Channels
Mention your bot: `@YourBot what is the capital of France?`

### In Direct Messages
Just send a message - no need to mention the bot

### Threaded Conversations
The bot maintains context within threads for back-and-forth conversations

## Troubleshooting

### Bot doesn't respond
- Check Render logs for errors
- Verify environment variables are set correctly
- Make sure Event Subscriptions URL shows a green checkmark in Slack

### "Unauthorized" errors
- Verify your Signing Secret is correct
- Check that Slack's request verification is working

### OpenAI errors
- Check your API key is valid
- Verify you have credits in your OpenAI account
- Check rate limits at platform.openai.com

### No sparkle icon appears
- Make sure "Agent or Assistant" toggle is ON in Slack app settings
- Try reinstalling the app to your workspace
- Check that `assistant_thread_started` event is subscribed

## Cost Considerations

- **GPT-4o**: ~$2.50 per 1M input tokens, ~$10 per 1M output tokens
- For typical team usage, this should cost less than $10/month
- Consider using `gpt-4o-mini` for 94% lower costs ($0.15/$0.60 per 1M tokens)

Change the model in `server.js`:
```javascript
model: 'gpt-4o-mini'  // Instead of 'gpt-4o'
```

## Advanced Features

Want to add more capabilities? Consider:

- **Function calling** - Let your GPT use tools/actions
- **File uploads** - Process documents from Slack
- **Typing indicators** - Show when the bot is "thinking"
- **Slash commands** - Add `/ask` command
- **User context** - Pass Slack user info to OpenAI
- **Rate limiting** - Prevent abuse

## Security Notes

- ✅ Request signatures verified
- ✅ Environment variables for secrets (never in code)
- ✅ HTTPS only
- ⚠️ Consider adding rate limiting for production
- ⚠️ Monitor OpenAI usage to prevent unexpected costs

## Repository

https://github.com/karibluedogdesign/slack-gpt-bot

Questions? Open an issue on GitHub!