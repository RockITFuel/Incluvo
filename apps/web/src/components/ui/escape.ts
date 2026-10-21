/**
 * Closes an overlay on Escape. Kobalte 2.0.0-alpha.2 listens for Escape
 * through `@solid-primitives/keyboard`, whose shortcut never fires under
 * Solid 2, so dialogs, menus and popovers would stay open (found in
 * project-alpha, glass-ui/src/liquid/glass-dialog.tsx). A control inside that
 * uses Escape itself calls `preventDefault` first and keeps the key.
 *
 *   <KDialog.Content onKeyDown={closeOnEscape(() => setOpen(false))}>
 */
export const closeOnEscape = (close: () => void) => (event: KeyboardEvent) => {
	if (event.key !== "Escape" || event.defaultPrevented) return;
	event.preventDefault();
	close();
};
