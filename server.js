import express from 'express';
import { createHmac } from 'crypto';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 3000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Your GPT's system instructions
const SYSTEM_PROMPT = `You are a helpful assistant. Replace this with your actual GPT's instructions.`;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Verify Slack requests
function verifySlackRequest(req) {
  const slackSignature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;

  // Prevent replay attacks
  const time = Math.floor(new Date().getTime() / 1000);
  if (Math.abs(time - timestamp) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${JSON.stringify(req.body)}`;
  const mySignature = 'v0=' + createHmac('sha256', slackSigningSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  return slackSignature === mySignature;
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Slack GPT Bot is running' });
});

// Slack Events endpoint
app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  // Verify request is from Slack
  if (!verifySlackRequest(req)) {
    return res.status(401).send('Unauthorized');
  }

  // Handle URL verification challenge
  if (type === 'url_verification') {
    return res.json({ challenge });
  }

  // Respond quickly to Slack (required within 3 seconds)
  res.status(200).send();

  // Handle AI agent thread started
  if (event && event.type === 'assistant_thread_started') {
    await handleAssistantThread(event);
  }

  // Handle app_mention events
  if (event && event.type === 'app_mention') {
    await handleMention(event);
  }

  // Handle direct messages
  if (event && event.type === 'message' && event.channel_type === 'im') {
    await handleDirectMessage(event);
  }
});

// Handle AI agent conversations in side panel
async function handleAssistantThread(event) {
  try {
    const userMessage = event.assistant_thread.user_message;
    const channelId = event.assistant_thread.channel_id;
    const threadTs = event.assistant_thread.thread_ts;
    
    // Get thread history if available
    const messages = await getAssistantThreadHistory(channelId, threadTs);
    
    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content;

    // Send reply to the assistant thread
    await sendAssistantMessage(channelId, threadTs, reply);

  } catch (error) {
    console.error('Error handling assistant thread:', error);
    await sendAssistantMessage(
      event.assistant_thread.channel_id,
      event.assistant_thread.thread_ts,
      'Sorry, I encountered an error processing your request.'
    );
  }
}

// Get conversation history from assistant thread
async function getAssistantThreadHistory(channelId, threadTs) {
  const messages = [];
  
  try {
    const response = await fetch('https://slack.com/api/conversations.replies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
      },
      body: JSON.stringify({
        channel: channelId,
        ts: threadTs
      })
    });

    const data = await response.json();
    
    if (data.ok && data.messages) {
      // Convert thread messages to OpenAI format, filtering out messages without text
      data.messages.forEach(msg => {
        if (msg.text && msg.text.trim()) {
          messages.push({
            role: msg.bot_id ? 'assistant' : 'user',
            content: msg.text
          });
        }
      });
    }
  } catch (error) {
    console.error('Error fetching assistant thread history:', error);
  }
  
  return messages;
}

// Send message to assistant thread
async function sendAssistantMessage(channelId, threadTs, text) {
  try {
    const payload = {
      channel: channelId,
      thread_ts: threadTs,
      text: text
    };

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!data.ok) {
      console.error('Slack API error:', data.error);
    }
  } catch (error) {
    console.error('Error sending assistant message:', error);
  }
}

// Handle when bot is mentioned
async function handleMention(event) {
  try {
    const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    
    // Get thread history if this is part of a thread
    const messages = await getThreadHistory(event);
    
    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content;

    // Send reply to Slack
    await sendSlackMessage(event.channel, reply, event.ts);

  } catch (error) {
    console.error('Error handling mention:', error);
    await sendSlackMessage(
      event.channel, 
      'Sorry, I encountered an error processing your request.',
      event.ts
    );
  }
}

// Handle direct messages
async function handleDirectMessage(event) {
  // Ignore bot's own messages
  if (event.bot_id) return;

  try {
    // Get conversation history
    const messages = await getThreadHistory(event);
    
    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
        { role: 'user', content: event.text }
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content;

    // Send reply to Slack
    await sendSlackMessage(event.channel, reply);

  } catch (error) {
    console.error('Error handling DM:', error);
    await sendSlackMessage(
      event.channel, 
      'Sorry, I encountered an error processing your request.'
    );
  }
}

// Get conversation history from thread
async function getThreadHistory(event) {
  const messages = [];
  
  // If this is part of a thread, fetch thread messages
  if (event.thread_ts) {
    try {
      const response = await fetch('https://slack.com/api/conversations.replies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
        },
        body: JSON.stringify({
          channel: event.channel,
          ts: event.thread_ts
        })
      });

      const data = await response.json();
      
      if (data.ok && data.messages) {
        // Convert thread messages to OpenAI format, filtering out messages without text
        data.messages.slice(0, -1).forEach(msg => {
          const content = msg.text ? msg.text.replace(/<@[A-Z0-9]+>/g, '').trim() : '';
          if (content) {
            messages.push({
              role: msg.bot_id ? 'assistant' : 'user',
              content: content
            });
          }
        });
      }
    } catch (error) {
      console.error('Error fetching thread history:', error);
    }
  }
  
  return messages;
}

// Send message to Slack
async function sendSlackMessage(channel, text, threadTs = null) {
  try {
    const payload = {
      channel: channel,
      text: text,
      ...(threadTs && { thread_ts: threadTs })
    };

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!data.ok) {
      console.error('Slack API error:', data.error);
    }
  } catch (error) {
    console.error('Error sending message to Slack:', error);
  }
}

app.listen(port, () => {
  console.log(`Slack GPT Bot listening on port ${port}`);
});