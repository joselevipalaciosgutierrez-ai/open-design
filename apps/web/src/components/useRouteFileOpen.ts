import { useEffect, useRef } from 'react';

/**
 * Opens the file named in the URL, once per change of that file.
 *
 * The opener is read through a ref on purpose. Its identity changes with things
 * unrelated to the URL (the conversation's mode), and an effect that listed it
 * as a dependency re-ran on every such change and opened the file AGAIN, so a
 * file the user had just closed came back, and a preview closed in Design
 * reappeared on the way back to Ask. A new file in the URL is the only thing
 * that should open one.
 */
export function useRouteFileOpen(routeFileName: string | null | undefined, open: (name: string) => void): void {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!routeFileName) return;
    openRef.current(routeFileName);
  }, [routeFileName]);
}
