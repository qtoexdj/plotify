#!/usr/bin/env node
process.env.PLOTIFY_GUARDED_COMMAND = 'restore-rehearsal'
await import('./generic-guarded-command.mjs')
