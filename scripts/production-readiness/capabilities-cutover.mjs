#!/usr/bin/env node
process.env.PLOTIFY_GUARDED_COMMAND = 'capabilities-cutover'
await import('./generic-guarded-command.mjs')
