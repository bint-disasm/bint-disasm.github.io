// Inline SVG icons from lucide.dev (ISC, https://lucide.dev/license).
//
// Kept as raw strings rather than a bundled icon package so we don't
// drag in a build step. Add new icons by grabbing the SVG markup from
// lucide.dev/icons, stripping the outer <svg> attributes (we set those
// in `icon()`), and pasting the inner <path>/<rect>/etc. elements as a
// new entry below.
//
// All icons use `stroke="currentColor"` so a CSS `color:` on the
// containing button styles them — same way text glyphs would behave.

const ICONS = {
    lock: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
           <path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
    unlock: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
             <path d="M7 11V7a5 5 0 0 1 9.9-1"/>`,
};

/**
 * Returns an inline SVG string for `name`. `size` is the px width/height
 * (defaults to 14 — sized for inline-tab buttons). The result is meant
 * to be assigned to `element.innerHTML`; for component-internal use,
 * not for echoing untrusted data.
 */
export function icon(name, size = 14) {
    const body = ICONS[name];
    if (!body) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `
         + `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" `
         + `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
