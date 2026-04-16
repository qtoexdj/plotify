# Telegram Integration Skill

Comprehensive skill for building Telegram bots and Mini Apps using the Telegraf framework. Handles bot setup, webhook configuration, Mini App integration, AI chatbot patterns, and deployment to Railway/Vercel/serverless platforms.

## Quick Start

**Activate the skill:**
```
/telegram
```

Or simply mention Telegram in your request:
- "Help me set up a Telegram bot"
- "My Telegram webhook isn't working"
- "Add a Telegram Mini App to this project"
- "Deploy my Telegram bot to Railway"

## What This Skill Covers

### 🤖 Bot Development
- Creating bots via @BotFather
- Command handlers and message processing
- Inline keyboards and interactive UI
- File handling (photos, voice, documents)
- Context-aware conversation management

### 🌐 Mini Apps (Web Apps)
- Client-side SDK integration
- Server-side initData validation (HMAC-SHA-256)
- Theme integration with Telegram
- Launch methods (keyboard, inline, menu buttons)
- Security best practices

### 🔌 Deployment & Configuration
- **Local:** Polling setup with forwarding script
- **Production:** Webhook configuration with secret tokens
- **Platforms:** Railway, Vercel, serverless
- Environment-specific patterns
- Migration from polling to webhooks

### 🤖 AI Integration
- Unified chat manager patterns
- Streaming responses
- Context switching
- Multi-platform support

### 🐛 Debugging & Troubleshooting
- Webhook configuration issues
- Secret token validation
- Platform-specific problems (Railway caching, Vercel timeouts)
- Local vs production behavior differences
- Problem-solution quick reference matrix

## Workflows

The skill uses a **Diagnostic Router Pattern** to quickly route you to the right solution:

1. **NEW_PROJECT** - Starting fresh
2. **DEBUGGING** - Fixing issues
3. **FEATURE_ADDITION** - Adding capabilities
4. **DEPLOYMENT** - Going to production

## Key Features

### Environment-Specific Guidance
- ✅ **Local Development:** Polling with `telegram-polling.js` script
- ✅ **Production:** Webhooks with HTTPS and secret tokens
- ✅ Clear migration path between environments

### Platform-Specific Solutions
- ✅ **Railway:** Build-time vs runtime token initialization, caching fixes
- ✅ **Vercel:** Deployment Protection settings, timeout handling, edge functions
- ✅ **Serverless:** Event-driven patterns, cold start handling

### Security by Default
- ✅ Webhook secret token validation
- ✅ Mini App initData HMAC-SHA-256 verification
- ✅ Environment variable best practices
- ✅ HTTPS enforcement for production

### Problem-Solution Matrix
Quick reference for common issues:
- Webhook 401/403 errors
- Duplicate message processing
- SSL certificate problems
- Mini App caching issues
- Local vs production discrepancies

## Code Patterns Included

### Singleton Bot Service
Handles Next.js build vs runtime token initialization:
```typescript
class TelegramBotService {
  private static instance: Telegraf | null = null;
  static getInstance() {
    if (!this.instance) {
      const token = process.env.TELEGRAM_BOT_TOKEN || 'DUMMY_BUILD_TOKEN';
      this.instance = new Telegraf(token);
      this.registerCommands();
    }
    return this.instance;
  }
}
```

### Webhook API Route
Secure webhook handling with secret validation:
```typescript
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const update = await request.json();
  await TelegramBotService.processUpdate(update);
  return Response.json({ ok: true });
}
```

### Mini App Validation
Server-side security for Mini Apps:
```typescript
export function validateTelegramInitData(
  initData: string,
  botToken: string
): boolean {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  // HMAC-SHA-256 validation...
  return computedHash === hash;
}
```

## When to Use

**✅ Use this skill when:**
- Starting new Telegram bot or Mini App
- Debugging webhook/polling issues
- Adding features to existing bot
- Deploying to production
- Integrating AI with Telegram
- Fixing platform-specific issues

**❌ Don't use this skill for:**
- Other messaging platforms (Discord, Slack, WhatsApp)
- General deployment without Telegram context
- Generic API/webhook issues
- Just because Telegram code exists

## Requirements

- **Framework:** Telegraf (recommended) or other Node.js bot library
- **Runtime:** Node.js 18+
- **Platform:** Next.js, Express, or serverless
- **Production:** HTTPS endpoint for webhooks

## Best Practices

1. **Development:** Use polling locally (no HTTPS needed)
2. **Production:** Use webhooks (event-driven, lower latency)
3. **Security:** Always validate webhook secrets and Mini App initData
4. **Tokens:** Use dummy token for build, real token at runtime
5. **Debugging:** Check `getWebhookInfo` and platform logs first

## Common Issues Solved

| Issue | Solution in Skill |
|-------|------------------|
| Bot works locally, fails remotely | Environment-specific setup section |
| Webhook returns 401/403 | Secret token validation patterns |
| Mini App won't load | HTTPS requirements and validation guide |
| Duplicate messages | Vercel timeout handling |
| Railway caching issues | Force dynamic rendering patterns |

## File Structure

```
telegram-integration/
├── SKILL.md           # Main skill documentation (~1200 lines)
├── README.md          # This file
└── PUBLISHING.md      # Marketplace publishing guide
```

## Documentation Sections

- ⚠️ Verification Required
- Quick Start Diagnostic Router
- NEW_PROJECT Workflow
- DEBUGGING Workflow
- FEATURE_ADDITION Workflow
- DEPLOYMENT Workflow
- MINI APP INTEGRATION
- Problem-Solution Quick Reference
- Best Practices
- Platform-Specific Solutions

## Version

**Current Version:** 1.0.0
**Last Updated:** 2025-01-27
**Status:** Production-ready

## Resources

- **Telegram Bot API:** https://core.telegram.org/bots/api
- **Mini Apps (Web Apps):** https://core.telegram.org/bots/webapps
- **Telegraf Docs:** https://telegraf.js.org/

## Support

For issues, questions, or contributions related to this skill:
1. Check the Problem-Solution Matrix in SKILL.md
2. Review platform-specific sections for your deployment target
3. Consult the Debugging Workflow for systematic troubleshooting

## License

This skill is part of the workout-ai project and follows the same license.

---

**Access:** Type `/telegram` in Claude Code or mention Telegram in your request.
