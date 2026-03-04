# Design Reference — Alex Finn's Mission Control

## Color Palette (EXACT — match these)
- **App background**: `#0D0D0F` to `#141420` (deep black/charcoal)
- **Sidebar background**: `#141418` (slightly lighter than background)
- **Sidebar active item**: `#1E1E24` highlight
- **Card backgrounds**: `#252535` or `#2A2A3C` (elevated dark surface)
- **Card borders**: `#333345` or `rgba(255,255,255,0.05)` (very subtle)
- **Primary accent**: Purple/indigo `#7C3AED` to `#6D28D9` (buttons, active states)
- **Primary text**: `#F0F0F0` (white/near-white)
- **Secondary text**: `#8888AA` or `#9999AA` (muted gray-purple)
- **Timestamps**: `#666680` (more muted)

## Status/Tag Colors
- Active/Success: Green `#22C55E` / `#10B981`
- Warning/In-Progress: Orange/Amber `#F59E0B`
- Error/Critical: Red `#DC2626` / `#E53E3E`
- Info/Planning: Blue `#3B82F6`
- Special: Purple `#A855F7`
- Priority High: Orange `#D97706`
- Priority Medium: Indigo `#4F46E5`

## Agent Avatar Colors (assign consistently)
- Bill 🫡: Purple `#7C3AED`
- Bob 🔨: Orange `#F59E0B`
- Forge ⚒️: Blue `#3B82F6`
- Truth 👁️: Teal `#14B8A6`
- Shark 🦈: Red `#DC2626`
- ACE 💪: Green `#22C55E`
- Sam 🎯: Indigo `#4F46E5`
- Marty 📣: Yellow `#EAB308`
- Quill ✍️: Coral `#EF4444`
- Pixel 🎨: Pink `#EC4899`
- Scrub 🧽: Cyan `#06B6D4`
- Scout 🔭: Emerald `#059669`
- Content PM 🗓️: Amber `#D97706`
- SENTINEL 🛡️: Slate `#64748B`
- Librarian 📚: Violet `#8B5CF6`
- Music Biz 🎶: Rose `#F43F5E`
- Vitruviano PM 📱: Lime `#84CC16`
- Ops 🛠️: Zinc `#71717A`

## Typography
- **Font**: Inter or system sans-serif (`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`)
- **NOT monospace** (the old v1 was monospace — that's wrong)
- Page titles: 24px bold white
- Card titles: 16-18px semibold white
- Body text: 13-14px regular light gray
- Timestamps: 11-12px muted

## Component Styles
- **Card border-radius**: 12px
- **Button border-radius**: 8px (standard) or 16-20px (pills)
- **Cards**: Subtle border, slight elevation over background
- **Tag/Status badges**: Small pills with colored text or colored background
- **Nav items**: Icon + text, ~14px, left-aligned
- **Sidebar width**: ~170-180px
- **Card padding**: 16px
- **Card spacing**: 12px gap

## Layout
- Left sidebar (fixed, 170-180px)
- Top bar spanning content area (stats, search ⌘K, actions)
- Main content area fills remaining width
- Some pages have a right panel (Tasks has "Live Activity" ~280-320px)

## Reference Pages (Alex Finn has these)
1. Tasks (Kanban) — 4 columns, live activity feed, stats bar, "+ New task" button
2. Calendar — Weekly view, "Always Running" horizontal bar, color-coded by agent
3. Projects — Card grid, progress bars, priority pills, avatar circles
4. Docs — 3-panel: file browser + tags/filters + document viewer
5. Team — Featured agent card + grid of agents grouped by machine/role
6. Office — Pixel art virtual workspace (eBoy style)
7. Also has: Content, Approvals, Council, Memory, People, System, Radar, Factory, Pipeline, Feedback
