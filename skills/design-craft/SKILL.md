---
name: design-craft
description: "The design rulebook: banned generic patterns, colour and type, one primary CTA, interaction-state contrast, sizing, layout integrity, text over images and image sourcing. Read before you design, restyle or polish any artifact."
triggers:
  - "design"
  - "diseño"
  - "layout"
  - "landing"
  - "prototype"
  - "slide"
  - "deck"
  - "dashboard"
  - "ui"
  - "style"
  - "polish"
license: MIT
od:
  mode: utility
  category: creative-direction
---

## Design Craft

### Avoid the Generic, Template-Driven "AI Gloss"

Do not use:

- A purple gradient wash or gradients on every background layer;
- Emoji as functional icons;
- The overused "colored vertical bar on the left + rounded card" callout pattern;
- Hover states that make text gray or lighter;
- Hand-drawn SVG people or scenes;
- Multiple solid buttons for the same action in one viewport, or icons beside every heading;
- Inter, Roboto, Arial, or Fraunces as display typefaces; they may be used for body text;
- Invented metrics or meaningless filler copy;
- Warm beige or cream backgrounds by default unless the brand requires them;
- Control panels in a product artifact that exist only for the designer or presenter.

When real values are unavailable, use honest, clearly labeled placeholders. Never fabricate data. Ask before adding content the user did not request.

### Color and Typography

- Derive the palette only from the brand, domain, screenshot, or selected direction—not from the application chrome.
- Use `oklch()` to generate derived colors. Do not invent hex values.
- Use one accent color, appearing no more than twice per screen.
- Display and body typefaces must be different. A single type family is appropriate only for utilitarian or data-dense briefs.
- Use one decisive visual flourish across the entire design; three is noise.

### Action Economy: One Action, One Primary CTA

For a single action—such as signing up, purchasing, downloading, or submitting—use only one primary-styled button on the page by default. A long scrolling page may repeat it once at the end, but never show a second instance within the same viewport. Other entry points in the navigation, hero, cards, and footer must be secondary, ghost, or text links, and their copy should not repeat word for word.

An adjacent button group may contain at most one solid primary button. Unless the user explicitly requests otherwise, three or more buttons for the same action constitute a failed delivery.

### Interaction States and Contrast

For hover, focus, active, disabled, and similar states, define and verify foreground and background colors as a pair. Text contrast after a state change must never be lower than in the default state:

- At least 4.5:1 for normal text;
- At least 3:1 for large text and icons.

For hover, move the background by ±0.06–0.12 on the OKLch L channel, or adjust the border, shadow, or position. Never change the foreground to `--muted` or another color closer to the background. Never allow light text on a light background or dark text on a dark background. When a solid button inverts its colors on hover, swap both foreground and background in the same rule. Disabled is the only state allowed to reduce contrast. Every focusable element must have a clear `:focus-visible` focus ring.

### Sizing

- For 1920×1080 slides: titles must be at least 36px and body text at least 24px.
- Touch targets must be at least 44px.
- Print text must be at least 12pt.
- Mobile layouts must not scroll horizontally. Redesign for small screens rather than merely squeezing the desktop layout.

### Layout Integrity

These are hard requirements, not matters of taste:

- Elements must never overlap accidentally.
- Text must fit fully within its container without clipping or overflowing table cells.
- Avoid orphaned characters or words on the final line in every language. Poor container sizing, layout constraints, or line-breaking rules must not leave only 1–2 characters, a short word, or an unnaturally short phrase on the final line while the preceding line still has ample room. Adjust the container, layout, and wrapping rules first; if necessary, then fine-tune font size, letter spacing, or word spacing. Never conceal the problem with hidden overflow.
- Oversized display type must fit its column. Reduce the size, allow wrapping, or widen the column as needed. Never use `white-space: nowrap` to force text into adjacent elements.
- Charts must use filled data encoding, not empty outlines alone.

### Text Overlays on Images

When badges, labels, or annotation cards are placed over an image, anchor them to one corner with consistent inset spacing on all sides. Keep the overlay entirely within the image bounds; it must not cross the edge or hang halfway outside. Avoid covering faces or the image's main subject. Give the overlay a solid or frosted-glass background with a shadow so it remains visually distinct from the photo. If no corner is safe, place the text beside the image instead of forcing it on top.

### Visual Finish

The final artifact must feel genuinely finished, not like a gray wireframe. Use meaningful imagery whenever products, environments, food, people, places, artwork, heroes, or textures materially affect the result. Do not fall back to empty slots, generic icons, or hand-drawn wireframe boxes when an image is part of the content.

Apply this real-first sourcing order:

1. **Reuse trusted assets first:** Prefer user-provided, project-local, and brand-owned assets when they correctly represent the subject.
2. **Acquire factual imagery:** When content names or otherwise clearly identifies a real-world referent—including a person, product, brand mark, book or album cover, artwork, event, landmark, or place—you must search for or fetch the correct real image with available authorized tools, confirm that it depicts the intended referent, and localize it. Never use image generation, drawings, generic stock, look-alikes, or fictional substitutes for a real referent.
3. **Keep demo content real:** Sample and demo content defaults to real, well-known referents with their correct real images. Do not invent fictional catalog items, brands, covers, products, or places merely to avoid searching for and acquiring the real assets.
4. **Prefer real photography for non-factual subjects:** For illustrative or atmospheric subjects, first search for suitable real photography. Use generated imagery only when the user explicitly requests a generated style or no suitable real asset can be acquired after a genuine search.
5. **Generate only appropriate fallbacks:** When generation is appropriate and OD media tools are available, use `"$OD_NODE_BIN" "$OD_BIN" media generate --surface image …`; otherwise, use the runtime's native image-generation capability. Spend generation on the few key surfaces that materially improve the result, and never use it to bypass factual image acquisition.
6. **Make unresolved limitations explicit:** Honor task-specific licensing, privacy, and attribution requirements. If they rule out one source, continue searching within the allowed sources. If no compliant real asset can be acquired, use an intentional labeled placeholder and state the limitation in the delivery summary; do not fabricate a stand-in.

Every used image must become either a project-local file referenced with a relative path or an inline data URI appropriate to the execution profile. Never hotlink an image or depend on an expiring remote URL. Before styling a localized image, inspect its intrinsic width and height. A content image's rendered box or container must adopt that measured ratio through natural sizing, matching `width`/`height` attributes, or a matching `aspect-ratio`; never reuse a placeholder's fixed ratio when replacing it with the real image. Show the full frame with `object-fit: contain` or natural flow, and reserve `object-fit: cover` for deliberately croppable decorative fills. Do not lock both rendered axes on variable-ratio content. If an unusually tall or wide image would dominate the page, constrain one axis with `max-height` or `max-width` and leave the other axis automatic instead of cropping, stretching, or letting it create an excessive page-height column. Declare dimensions or aspect ratio to prevent layout shift, give meaningful images accurate alt text, and use empty alt text for purely decorative images.

Build a complete palette with a primary color, a domain-relevant accent, and state colors. Interaction states must provide clear color feedback, and primary controls must have realistic product-scale dimensions.
