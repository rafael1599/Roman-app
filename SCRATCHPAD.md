# Roman-app Scratchpad

Quick, transient notes for the current session. Move permanent insights to `.agent/knowledge/`.

---

## 🕒 Current Focus

- **Feature Stability**: Monitoring the new TypeScript-based Smart Picking engine.
- **Type Adoption**: Converting remaining UI components to `.tsx`.
- **Performance**: Ensuring Supabase real-time sync doesn't hit throttle limits during peak picking.

## 📝 Pending Tasks

- [ ] Resolve remaining lint errors in migrated `.tsx` files.
- [ ] Implement automated regression tests for inventory deduction.
- [ ] Add barcode scanning support (Roadmap).

## 💡 Quick Insights (Session)

- TypeScript interfaces in `smart-picking/types.ts` significantly reduced "undefined" errors during pallet splitting.
- Hybrid AI fallback ensures 99% uptime for order extraction even on Gemini's free tier.
