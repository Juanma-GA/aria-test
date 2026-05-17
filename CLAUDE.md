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
