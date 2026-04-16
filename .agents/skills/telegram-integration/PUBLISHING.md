# Telegram Integration Skill - Publishing Guide

## Current Status

**Location:** `.claude/skills/telegram-integration/`
**Command:** `/telegram`
**Status:** ✅ Ready to use in this project

The skill is fully functional and available via the `/telegram` slash command in Claude Code.

## How to Use

Type `/telegram` in Claude Code to activate the telegram-integration skill for:
- Starting new Telegram bot or Mini App projects
- Debugging webhooks, polling, and deployment issues
- Adding features (commands, AI integration, Mini Apps)
- Deploying to Railway/Vercel/serverless platforms

The skill will automatically route you to the appropriate workflow based on your needs.

## Publishing to Marketplace (Future)

When ready to publish this skill to a marketplace following the Superpowers pattern, follow these steps:

### 1. Repository Structure

Create two repositories:

**Marketplace Repository** (e.g., `imehr-marketplace`):
```
imehr-marketplace/
├── .claude-plugin/
│   └── config.json          # Plugin metadata
├── skills/
│   └── telegram-integration/
│       └── SKILL.md
├── commands/
│   └── telegram.md
├── README.md
└── package.json            # Optional: npm distribution
```

**Skills Repository** (e.g., `skills`):
```
skills/
├── deployment/
│   └── telegram-integration/
│       ├── SKILL.md
│       ├── README.md
│       ├── PUBLISHING.md
│       └── TEST_RESULTS.md (if applicable)
├── infrastructure/
├── development/
└── README.md
```

### 2. Plugin Configuration

Create `.claude-plugin/config.json`:

```json
{
  "name": "imehr",
  "version": "1.0.0",
  "description": "Custom skills and commands for AI-powered development",
  "author": "imehr",
  "skills": [
    {
      "name": "telegram-integration",
      "path": "skills/telegram-integration",
      "category": "deployment",
      "tags": ["telegram", "bot", "mini-app", "webhook", "deployment"]
    }
  ],
  "commands": [
    {
      "name": "telegram",
      "path": "commands/telegram.md",
      "description": "Telegram bot and Mini App integration"
    }
  ]
}
```

### 3. Installation Flow

Users would install via:

```bash
# Add marketplace
/plugin marketplace add imehr/imehr-marketplace

# Install plugin
/plugin install imehr@imehr-marketplace
```

After installation, users can:
- Type `/telegram` to access the skill
- Skill auto-activates when user mentions Telegram work
- Appears in `/help` under custom commands

### 4. Files to Include

**Minimum Required:**
- `SKILL.md` - Main skill documentation (✅ exists)
- `README.md` - Overview and installation instructions
- `PUBLISHING.md` - This file

**Recommended:**
- `examples.md` - Real-world usage examples
- `reference.md` - Detailed API/pattern reference
- `troubleshooting.md` - Extended problem-solution guide
- `TEST_RESULTS.md` - Testing documentation

### 5. Quality Checklist

Before publishing, ensure:

- [ ] YAML frontmatter with `name` and `description`
- [ ] Description starts with "Use when..."
- [ ] "When to Use" and "When NOT to Use" sections
- [ ] Verification section (⚠️ VERIFICATION REQUIRED)
- [ ] Quick Reference tables
- [ ] Code examples use proper syntax highlighting
- [ ] Token efficiency (main SKILL.md under ~1500 lines)
- [ ] Tested in multiple scenarios
- [ ] Platform-specific guidance accurate (Railway, Vercel)

Current status: ✅ All checklist items met

### 6. Publishing Process

1. **Create Marketplace Repo:**
   ```bash
   gh repo create imehr/imehr-marketplace --public
   cd imehr-marketplace
   mkdir -p .claude-plugin skills commands
   ```

2. **Copy Skill Files:**
   ```bash
   cp -r /path/to/project/.claude/skills/telegram-integration skills/
   cp /path/to/project/.claude/commands/telegram.md commands/
   ```

3. **Add Plugin Config:**
   Create `.claude-plugin/config.json` (see template above)

4. **Create README:**
   Document available skills and installation instructions

5. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Add telegram-integration skill"
   git push origin main
   ```

6. **Test Installation:**
   ```bash
   /plugin marketplace add imehr/imehr-marketplace
   /plugin install imehr@imehr-marketplace
   /telegram  # Test command
   ```

### 7. Maintenance

**Updating the Skill:**
1. Make changes in this project's `.claude/skills/telegram-integration/`
2. Test thoroughly
3. Copy updated files to marketplace repo
4. Bump version in `.claude-plugin/config.json`
5. Tag release: `git tag v1.1.0 && git push --tags`
6. Users update with: `/plugin update imehr@imehr-marketplace`

**Adding More Skills:**
Follow the same structure:
- Add skill to `skills/<category>/<skill-name>/`
- Add command to `commands/<command-name>.md`
- Update `.claude-plugin/config.json`
- Test before releasing

## Alternative: NPM Distribution

Skills can also be distributed via npm (like Superpowers):

```json
{
  "name": "@imehr/claude-skills",
  "version": "1.0.0",
  "description": "Custom Claude Code skills and commands",
  "main": "index.js",
  "files": [
    "skills/",
    "commands/",
    ".claude-plugin/"
  ]
}
```

Install via:
```bash
npm install -g @imehr/claude-skills
```

## Current Workflow (Project-Local)

The skill is currently project-local and works perfectly in this repository:

**Location:**
- Skill: `.claude/skills/telegram-integration/SKILL.md`
- Command: `.claude/commands/telegram.md`

**Usage:**
- Type `/telegram` in Claude Code
- Skill activates when you mention Telegram work
- Available in `/help` under project commands

**No publishing needed** unless you want to share with other projects or users.

## References

- **Superpowers Marketplace:** https://github.com/obra/superpowers
- **Superpowers Skills:** https://github.com/obra/superpowers (skills/ directory)
- **Claude Code Plugins:** https://docs.claude.com/claude-code (when available)

---

Last updated: 2025-01-27
Skill version: 1.0.0
Status: Project-local (ready for marketplace publishing)
