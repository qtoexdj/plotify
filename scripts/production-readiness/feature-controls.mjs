#!/usr/bin/env node
process.env.PLOTIFY_GUARDED_COMMAND = 'feature-controls'
await import('./generic-guarded-command.mjs')
