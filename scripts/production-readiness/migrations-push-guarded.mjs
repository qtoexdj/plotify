#!/usr/bin/env node
process.env.PLOTIFY_GUARDED_COMMAND = 'migrations-push-guarded'
await import('./generic-guarded-command.mjs')
