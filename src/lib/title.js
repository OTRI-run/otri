import { useEffect } from 'preact/compat'

// Sets the browser tab title for the current screen. A hash-routed app otherwise shows one title
// for every page, which makes history, bookmarks and open tabs indistinguishable. Pass null to
// leave the title to a child component that knows more (a race page once the race has loaded).
export function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
