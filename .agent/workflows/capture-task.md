---
description: How to capture new tasks, bugs, or ideas into the project backlog
---

# 📝 Task Capture Workflow

Use this workflow when the user mentions a new requirement, a bug found during testing, or a future improvement.

## Steps

### 1. Categorize the Input
Identify where the new item belongs:
- **Active Phase**: Immediate next steps for the current goal.
- **Future Features & Ideas**: Long-term improvements or new functionality.
- **Bug Tracker**: Defects or unintended behaviors.

### 2. Update BACKLOG.md
Append the new item to `.agent/management/BACKLOG.md` in the appropriate section.
Use a clear, actionable title and assign a unique ID if it helps tracking.

Format:
`- [ ] **Title**: Description. <!-- id: task-XXX -->`

### 3. Verify and Confirm
After updating the file, confirm to the user that the item has been "filed" in the backlog.

## Why this is important?
- Prevents technical debt and forgotten ideas.
- Keeps the focus on the current task while acknowledging future work.
- Provides a clear roadmap for the user and the agent.
