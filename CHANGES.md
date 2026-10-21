# FASSA (Faculty of Science Students' Association) Competition Platform Changes

## Overview
Changes to support the new competition flow where:
- Admin creates competition with embedded categories (A, B, C)
- Game Master controls gameplay and switches between categories during the match
- Categories cycle automatically with GM control

## Schema Changes
- Added `categoryId` field to `Round` model - each round now has exactly one category
- Added relation from `Category` to `Round` for proper querying
- Categories are stored on the round during competition setup

## Competition Creation Flow
- Admin creates competition via setup wizard
- Categories (A, B, C) are embedded in rounds during creation
- One round per category
- All questions assigned to matches during setup
- Competition is ready to play immediately

## Game Master Controls
- GM sees competition name in header (not category name)
- GM can see active category during gameplay
- Categories cycle: A → B → C with GM control between them
- Leaderboard shows cumulative scores + per-category breakdown

## Player/School Access
- Schools access competition via code
- Players see active category questions during their turn
- No category selection - categories shown by GM during play
- Cumulative scores tracked per school

## Audience Screen
- Displays competition name, not category
- Shows category transitions as they happen
- Main screen shows the competition flow

## Score Tracking
- Scores are cumulative (not reset per category)
- Category-by-category scoring recorded in database
- Leaderboard displays both per-category and total scores

## Files Modified
1. `prisma/schema.prisma` - Added categoryId to Round, added rounds relation to Category
2. `src/app/api/admin/competitions/setup/route.ts` - Stores categoryId when creating rounds
3. `src/app/api/admin/rounds/route.ts` - Allows creating/updating rounds with category
4. `src/app/api/admin/competitions/[id]/route.ts` - Returns category info in round data
5. `src/lib/engine/snapshot.ts` - Added activeCategory, availableCategories, categoryScores
6. `src/app/screen/[id]/page.tsx` - Shows competition name, active category on board
7. `src/app/gm/[id]/page.tsx` - Shows competition name and active category
8. `src/app/play/page.tsx` - Shows category info, displays category scores
9. `src/app/admin/competitions/[id]/page.tsx` - Shows category on each round

## Future Work (Not Yet Implemented)
- School slider component for displaying schools one at a time
- GM "Next Category" button/control during gameplay
- Enhanced 2x2 grid layout for answer options
- Improved score animations