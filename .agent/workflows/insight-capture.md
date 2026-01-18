---
description: How to capture new insights and optimize for token efficiency
---

# Insight & Efficiency Capture Workflow

Use this workflow when you discover a "gotcha", a complex pattern, or a way to save tokens.

## Steps

### 1. Identify the Insight Type
- **Business Logic**: New rule about how the app should work.
- **Efficiency**: A way to use tools better or avoid redundant code.
- **Gotcha**: A bug or error that took more than 5 minutes to solve.
- **Architecture**: A decision on how components should interact.

### 2. Determine the File
Look into `.agent/knowledge/` and pick the most relevant file:
- `TOKEN_DRAINS.md`: For efficiency and tool-use lessons.
- `[CATEGORY].md`: For logic related to a specific feature (e.g., `SUPABASE_LOGIC.md`, `INVENTORY_FLOW.md`).
- Create a **NEW** file if the category doesn't exist.

### 3. Record the Insight
Append a concise entry to the file. Use the format:
```markdown
- 💡 [DATE] **Title**: Description of the insight/fix. 
- 🛠 **Action**: What to do (or avoid) next time.
```

### 4. Propose a Rule (Optional)
If the insight is a mandatory pattern for the whole project, suggest adding it to `.cursorrules` or a global rule file.

## Why this saves tokens?
- Prevents re-reading large files to find logic.
- Prevents "looping" on the same error.
- Keeps the context "sharp" and focused.
