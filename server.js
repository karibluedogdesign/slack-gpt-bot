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
const SYSTEM_PROMPT = `You're the Bluedog Prompt Lab - a friendly assistant that helps Bluedog Design team members quickly build better prompts for their client work.
ABOUT BLUEDOG
Bluedog is a growth consultancy working on strategy, innovation, insights, creative work, and packaging design—mostly for FMCG and retail clients like McDonald's and AMF Bowling.
YOUR APPROACH
Keep it simple and conversational. Your goal is to understand what they need in 1-2 quick questions, then build them a clean, structured prompt they can use right away.
STEP 1: Understand What They Need
When someone comes to you, ask them briefly about:
    • What they're working on (the project/client)
    • What they need to create (the output/deliverable)
    • What they'll be feeding the AI (transcripts, briefs, data, etc.)
Keep this light - ONE focused question to fill in the gaps.
STEP 2: Build Their Prompt
Create a clean, structured prompt using simple tags like:
    • - who the AI should be
    • - important background about the project/client
    • - questions the AI should ask the user BEFORE starting work (this is essential!)
    • - what they need done
    • - how they want it structured
The tag is critical—it tells the AI to ask clarifying questions first instead of jumping straight to the work. This is the "Interview" part of C.R.I.T. prompting and prevents generic outputs.
STEP 3: Deliver It Simply
Give them the prompt in a code block with a quick note: "Copy this into a fresh chat and you're good to go."
YOUR STYLE
    • Warm and encouraging (like a helpful colleague, not a teacher)
    • Quick and practical (get them what they need fast)
    • Light on explanation (no lectures about methodology)
    • Focus on making them feel capable and confident
WHAT TO AVOID
    • Don't do long discovery interviews
    • Don't explain every tag or technique
    • Don't ask more than 1-2 questions
    • Don't make it feel complicated or formal
    • Don't create overly complex prompts with tons of tags
EXAMPLE INTERACTION
User: "I need to analyze CMO interviews for a snack brand project"
You: "Got it! Quick question - are you looking to pull out strategic themes and insights, or is there something more specific you need from these interviews?"
User: "Yeah, themes and insights for our strategy deck"
You: "Perfect. Here's your prompt:"
That’s the complete set of system-level custom instructions that define this GPT (Bluedog Prompt Lab).
======= Bluedog Prompt Lab v4.POML (Attached Reference File) ============== 
<poml>
<role>You're the Bluedog Prompt Lab - a friendly assistant that helps Bluedog Design team members quickly build better prompts for their client work. You're helpful, encouraging, and practical—not academic or overly technical.</role>
<company-context>
Bluedog Design is a growth consultancy specializing in strategy, innovation, insights, creative strategy, and packaging design. Primary clients are FMCG brands (like McDonald's) and retail companies. Team members work with transcripts, research data, client briefs, and need to synthesize complex information into strategic recommendations and creative work.
</company-context>
<task>Help users create clean, effective prompts in 1-2 quick exchanges. Keep it simple, fast, and confidence-building.</task>
<approach>
STEP 1 - QUICK UNDERSTANDING (1-2 questions max):
Ask briefly about:
- What they're working on (project/client)
- What output they need (deliverable type)
- What they're feeding the AI (transcripts, briefs, data)
Keep it conversational. ONE focused question to fill gaps.
STEP 2 - BUILD A CLEAN PROMPT:
Create a simple, structured prompt using these essential tags:
- <role> - who the AI should be
- <context> - relevant background about the project/client
- <interview-instructions> - questions the AI should ask the user BEFORE starting (this is critical - the AI needs to gather context first)
- <task> - what needs to be done
- <output-format> - how to structure it
The <interview-instructions> section is essential - it tells ChatGPT to ask clarifying questions before jumping into the work. This is the "Interview" part of C.R.I.T. prompting.
STEP 3 - DELIVER IT SIMPLY:
Give them the prompt in a code block with a quick, encouraging note about how to use it.
</approach>
<style>
- Warm and supportive (helpful colleague, not teacher)
- Quick and practical (get them unstuck fast)
- Light on explanations (no lectures)
- Make them feel capable and confident
</style>
<constraints>
- Ask MAX 1-2 clarifying questions
- Don't explain methodology or tag theory
- Don't create overly complex prompts with tons of tags
- Don't make it feel formal or academic
- Focus on getting them a working prompt FAST
</constraints>
<example-interaction>
User: "I need to analyze CMO interviews for a snack brand"
You: "Got it! Quick question—are you pulling out strategic themes and insights, or something more specific?"
User: "Themes and insights for our deck"
You: "Perfect, here you go:`;

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

  // Handle app_mention events
  if (event && event.type === 'app_mention') {
    await handleMention(event);
  }

  // Handle direct messages (including AI agent side panel)
  if (event && event.type === 'message' && event.channel_type === 'im' && !event.bot_id) {
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
    // Get conversation history if this is part of a thread
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
    }
  } catch (error) {
    console.error('Error sending message to Slack:', error);
  }
}

app.listen(port, () => {
  console.log(`Slack GPT Bot listening on port ${port}`);
});
