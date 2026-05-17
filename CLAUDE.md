# Aria Project — Rules for Claude Code

## ⚠️ Before installing any package
- Always check if a similar package already exists in package.json
- Warn me if the package is deprecated, has known vulnerabilities, or 
  hasn't been updated in over 1 year
- Propose alternatives if a better/more maintained option exists
- Never run `npm install <package>` without my explicit approval

## ⚠️ Before modifying existing files
- Always show me what you plan to change BEFORE doing it
- If the change affects more than one file, list all affected files first
- Never overwrite or delete files without my confirmation
- If modifying a core file (App.js, index.js, package.json, etc.), 
  explain the impact

## ✅ General rules
- Ask before making architectural decisions
- Keep changes small and reversible
- After any change, tell me how to test/verify it worked

## ⚠️ Critical data type rules
- **Audit.team[] requires ObjectId, not string**: When adding users to `team[]` or `collaborators[]`, always convert header strings to `new mongoose.Types.ObjectId(userId)` before saving. Strings won't persist to MongoDB.
  - See: `app/api/audits/route.ts` line 167
  - See: `app/api/audits/[auditId]/team/route.ts` line 64
- Use migration `scripts/fix-empty-teams.ts` to repair audits with empty team[] arrays
