# THISTLEVANE — Complete Pixel Art Direction & Asset Overhaul

## ROLE

Act as the Lead Pixel Artist, Art Director, Senior 2D Game Artist, and Game Asset Pipeline Engineer for Thistlevane.

Your responsibility is to transform the game's current sprite assets into a cohesive, professionally art-directed pixel-art world.

The existing artwork lacks visual identity, consistency, and artistic direction. I want to address this systematically rather than applying random visual improvements to individual sprites.

Use **Witchbrook (https://www.witchbrook.com/)** as a major visual quality and art-direction reference.

IMPORTANT: Do not copy Witchbrook's artwork, characters, environments, or proprietary assets. Study its visual principles and develop an original identity for Thistlevane.

---

# PHASE 1 — UNDERSTAND THE EXISTING GAME

Before modifying anything:

1. Inspect the entire project structure.
2. Identify the game engine, rendering system, asset pipeline, and supported image formats.
3. Locate all existing:
   - Character sprites
   - NPC sprites
   - Monster and enemy sprites
   - Tilesets
   - Terrain assets
   - Buildings and structures
   - Environmental objects
   - Trees, plants, and vegetation
   - Weapons and equipment
   - Item icons
   - Animation sprite sheets
   - UI-related pixel art
4. Determine the actual sprite dimensions, tile dimensions, animation frame sizes, pivots, origins, and grid alignment.
5. Identify how sprite sheets are imported, referenced, sliced, and rendered in the game.
6. Inspect existing maps to understand how the tilesets are currently used.

Do not assume every asset uses the same dimensions.

Create an inventory of existing assets, including their locations, dimensions, formats, and current visual problems.

Do not modify the game engine, movement, combat, networking, or gameplay systems.

**The primary objective is ART IMPROVEMENT, not game architecture changes.**

# PHASE 2 — STUDY AND ESTABLISH THE ART DIRECTION

Study Witchbrook's official screenshots and available visual references.

Analyze these artistic elements:

### A. Color Theory
- Establish a harmonious color palette.
- Avoid random color combinations.
- Use intentional warm and cool color relationships.
- Create distinct palettes for different environments.
- Avoid excessive saturation.
- Establish consistent shadow and highlight colors.

### B. Pixel Art Technique
- Use deliberate pixel placement.
- Create readable silhouettes.
- Maintain consistent pixel density.
- Avoid blurry pixels and unnecessary anti-aliasing.
- Use controlled dithering only when appropriate.
- Avoid excessive outlines.
- Make lighting and shading consistent.

### C. Environmental Art
- Grass should have natural visual variation.
- Trees should have distinct silhouettes and layered foliage.
- Rocks should have believable shapes and volume.
- Water should have coherent colors, reflections, and animation.
- Paths should transition naturally into surrounding terrain.
- Buildings should have consistent perspective, proportions, and architectural language.

### D. Character Design
- Establish consistent character proportions.
- Create readable silhouettes.
- Use a consistent outline and shading technique.
- Make characters visually recognizable.
- Ensure animation frames maintain consistent proportions.
- Avoid characters that look like they came from completely different games.

### E. World Cohesion

Every visual element must belong to the same world.

A tree, house, NPC, monster, grass tile, stone pathway, and environmental prop should share the same artistic language.

The result should feel like one professionally art-directed game rather than a collection of unrelated pixel-art assets.

# PHASE 3 — CREATE THE THISTLEVANE ART BIBLE

Before replacing existing assets, create a permanent art direction document:

`docs/ART_BIBLE.md`

It must define:

1. Overall artistic identity.
2. Visual inspiration and differentiation from Witchbrook.
3. Color palette with exact HEX values.
4. Primary, secondary, shadow, and highlight colors.
5. Outline rules.
6. Lighting direction.
7. Pixel density and rendering rules.
8. Character proportions.
9. Environment and terrain design.
10. Foliage and vegetation design.
11. Building architecture.
12. Water and environmental animation.
13. Sprite sheet standards.
14. Animation consistency rules.
15. Asset export requirements.

Also establish reusable palette definitions and visual standards so future assets can follow the same rules.

Do not create a completely different style for every asset category.

# PHASE 4 — INVESTIGATE AND USE PIXEL ART SKILLS

Research and inspect available Claude Code skills and tools that can improve pixel-art production.

Start by evaluating:

1. pxl: https://github.com/crsolver/claude-pxl
2. Codixel: https://github.com/mankidev/codixel
3. Pixel Pipeline: https://github.com/emreozogul/skills
4. Concept to Pixel Assets: https://github.com/ForestSenYT/concept-to-pixel-assets

Also investigate other relevant tools if they offer meaningful improvements.

Evaluate:
- Compatibility with the current project.
- Supported sprite dimensions.
- Animation capabilities.
- Palette management.
- Tileset support.
- Sprite sheet export.
- Transparency handling.
- Integration with the existing game engine.
- Dependencies and maintenance.

Check whether the project already has relevant skills installed.

Do not install everything blindly.

If a tool requires dependencies or additional setup, explain why it is needed before proceeding.

Prefer workflows that allow assets to be inspected, edited, regenerated, and exported without damaging existing files.

# PHASE 5 — ASSET REDESIGN

Once the art bible is established, begin redesigning the existing artwork.

Work systematically by category.

## Priority 1: Environment and Terrain

Start with the assets that define the world:

- Grass tiles
- Dirt and soil
- Stone pathways
- Water
- Sand
- Rocks
- Trees
- Bushes
- Flowers
- Ground decorations

Create natural variations rather than repeating the same pattern.

Ensure tiles connect correctly in every supported direction.

Pay particular attention to:
- Seamless transitions.
- Autotiling compatibility.
- Consistent tile dimensions.
- Readable terrain boundaries.
- Natural environmental composition.

## Priority 2: Buildings and Structures

Improve:
- Houses
- Walls
- Doors
- Windows
- Roofs
- Fences
- Bridges
- Decorative structures

Establish a consistent architectural identity throughout the world.

## Priority 3: Characters and NPCs

Improve existing characters without changing their gameplay identity.

Preserve:
- Character identity.
- Directional orientation.
- Animation requirements.
- Sprite dimensions where required.
- Existing references and asset dependencies.

Improve their visual proportions, silhouettes, clothing details, shading, and readability.

## Priority 4: Monsters and Creatures

Give each creature a recognizable silhouette and visual personality.

Avoid simply changing colors on existing generic designs.

Use intentional shapes, anatomy, details, and color combinations.

## Priority 5: Objects, Items, and Equipment

Redesign:
- Weapons
- Armor
- Consumables
- Collectibles
- Environmental props
- Interactive objects

Ensure these assets are recognizable at their actual in-game size.

# PHASE 6 — ANIMATION QUALITY

Review all existing animated sprites.

Ensure:
- Consistent character proportions between frames.
- No unintended pixel shifting.
- No inconsistent outlines.
- Proper animation timing.
- Natural movement.
- Consistent ground positioning.
- No unintended transparent-edge artifacts.

Preserve the existing animation format and directional requirements.

Do not invent additional animation states unless the game supports them.

# PHASE 7 — VISUAL QUALITY CONTROL

Do not consider an asset finished just because it has been generated or exported.

Establish an iterative workflow:

1. Inspect the original asset.
2. Identify its visual weaknesses.
3. Apply the new art direction.
4. Generate or redraw the asset.
5. Export at native resolution.
6. Inspect an enlarged nearest-neighbor preview.
7. Compare it against neighboring assets.
8. Check its actual in-game appearance.
9. Correct inconsistencies.
10. Approve the final asset.

Evaluate every asset against:

- Silhouette readability.
- Color harmony.
- Pixel craftsmanship.
- Lighting consistency.
- Appropriate detail level.
- Compatibility with neighboring assets.
- Technical correctness.

If an asset looks visually inconsistent with the rest of the game, revise it.

Avoid blindly applying the same filter, palette replacement, or image-processing operation to every sprite.

Art direction requires artistic judgment, not just automation.

# PHASE 8 — IMPLEMENTATION AND SAFETY

This is an existing game project.

IMPORTANT RULES:

- Never overwrite original assets without keeping a backup.
- Preserve existing file paths and naming conventions when possible.
- Preserve sprite sheet dimensions when required by the game.
- Preserve animation frame ordering.
- Preserve transparent backgrounds.
- Preserve collision and interaction compatibility.
- Never introduce blurry scaling.
- Never introduce unintended anti-aliasing.
- Never break existing asset references.
- Do not modify gameplay systems to accommodate artwork.
- Do not delete assets simply because they look outdated.
- Do not replace working assets with unfinished concepts.

Use a separate redesigned asset directory or another safe staging strategy until assets have been approved.

Test redesigned assets in the actual game whenever possible.

# PHASE 9 — DOCUMENTATION

Maintain these documents:

`docs/ART_BIBLE.md`
The permanent visual identity and artistic rules.

`docs/ASSET_INVENTORY.md`
A complete inventory of original and redesigned assets.

`docs/ART_REDESIGN_LOG.md`
A record of what changed, why it changed, and which files were affected.

`docs/ASSET_QA.md`
Visual and technical quality-control results.

---

# EXECUTION STRATEGY

Do not attempt to redesign the entire game in one operation.

Work in milestones.

**Milestone 1 — Audit**
Understand the existing assets, engine, dimensions, and technical constraints.

**Milestone 2 — Art Direction**
Study Witchbrook, define the original Thistlevane identity, and create the art bible.

**Milestone 3 — Visual Prototype**
Redesign a small representative collection:
- One grass tile.
- One dirt tile.
- One water tile.
- One tree.
- One rock.
- One environmental decoration.
- One character sprite.

These assets will establish the visual standard for the entire game.

**Milestone 4 — Review**
Create a visual comparison of the original and redesigned assets.

Do not proceed to a complete asset overhaul until the prototype demonstrates a consistent and convincing art direction.

**Milestone 5 — Production**
Redesign the remaining assets category by category.

**Milestone 6 — Integration**
Implement approved assets and verify compatibility with the actual game.

**Milestone 7 — Final QA**
Inspect the complete world and correct remaining visual inconsistencies.

---

# EXPECTED RESULT

I want Thistlevane to have a recognizable, beautiful, cohesive pixel-art identity.

The game should feel like a carefully crafted world, not a generic collection of RPG Maker-style assets or randomly generated sprites.

Prioritize:
- Artistic identity over quantity.
- Consistency over unnecessary detail.
- Strong silhouettes over visual noise.
- Harmonious palettes over excessive colors.
- Beautiful environments over repetitive tiles.
- Proper pixel craftsmanship over artificial filters.

Use Witchbrook as an artistic quality benchmark, but create something that is unmistakably Thistlevane.

**Start with Milestone 1. Inspect the actual project before making any modifications. Present your findings, proposed art direction, recommended tools, and first prototype plan. Do not rush into generating assets.**
