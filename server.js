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
  console.log('Received request to /slack/events');
  
  const { type, challenge, event } = req.body;

  // Verify request is from Slack
  if (!verifySlackRequest(req)) {
    console.log('Request verification failed!');
    return res.status(401).send('Unauthorized');
  }

  // Handle URL verification challenge
  if (type === 'url_verification') {
    console.log('URL verification challenge received');
    return res.json({ challenge });
  }

  // Respond quickly to Slack (required within 3 seconds)
  res.status(200).send();

  console.log('Event type:', event?.type);

  // Handle app_mention events
  if (event && event.type === 'app_mention') {
    console.log('Handling app_mention');
    await handleMention(event);
  }

  // Handle direct messages (including AI agent side panel)
  if (event && event.type === 'message' && event.channel_type === 'im' && !event.bot_id) {
    console.log('Handling DM');
    await handleDirectMessage(event);
  }
});

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
  try {
    console.log('Processing DM:', event.text);
    
    // Get conversation history if this is part of a thread
    const messages = await getThreadHistory(event);
    
    console.log('Calling OpenAI with', messages.length, 'history messages');
    
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
    
    console.log('Got reply, sending to Slack');

    // Send reply to Slack - use thread_ts to keep conversation in same thread
    await sendSlackMessage(event.channel, reply, event.thread_ts || event.ts);

  } catch (error) {
    console.error('Error handling DM:', error);
    await sendSlackMessage(
      event.channel, 
      'Sorry, I encountered an error processing your request.',
      event.thread_ts || event.ts
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
        // Convert thread messages to OpenAI format, filtering out empty messages and the current one
        data.messages.forEach(msg => {
          // Skip the current message (we'll add it separately)
          if (msg.ts === event.ts) return;
          
          // Skip messages without text
          if (!msg.text || !msg.text.trim()) return;
          
          const content = msg.text.replace(/<@[A-Z0-9]+>/g, '').trim();
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
    } else {
      console.log('Message sent successfully');
    }
  } catch (error) {
    console.error('Error sending message to Slack:', error);
  }
}

app.listen(port, () => {
  console.log(`Slack GPT Bot listening on port ${port}`);
});