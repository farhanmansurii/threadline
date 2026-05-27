---
name: node-firebase
description: Firebase and Node backend workflow for RelayKit-detected repos.
---

# Node Firebase

Use when project detection finds Firebase or Firebase Admin.

Default workflow:

- avoid broad collection reads
- inspect rules/functions before changing data access
- preserve secrets in environment variables
- prefer emulator/local verification before deploy commands
