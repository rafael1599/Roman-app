# Token Drains & Efficiency Gotchas

This file tracks patterns, errors, or workflows that led to excessive token consumption or repetitive turns. Review this file before starting complex refactors.

## 🔴 Critical Drains (Avoid at all costs)

- _None recorded yet._

## ⚠️ Efficiency Warnings

- **Context Overload**: Reading files over 500 lines when only a specific function is needed. Use `view_code_item` instead.
- **Redundant State Sync**: Multiple hooks managing the same Supabase subscription. Always check if a context provider already has the data.

## 🛠 Lessons Learned

- _None recorded yet._
