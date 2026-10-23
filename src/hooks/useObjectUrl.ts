import { useLayoutEffect, useState } from "react";

// An object URL for displaying `blob`, or null without one. Each URL is
// revoked once the blob changes or the component unmounts, so only the image
// on screen holds one. The layout effect swaps the new URL in before paint;
// until then the previous URL stands in, so an <img> keeps its element and
// shows the old image until the new one has loaded.
export function useObjectUrl(blob: Blob | null): string | null {
	const [url, setUrl] = useState<string | null>(null);

	useLayoutEffect(() => {
		if (!blob) {
			setUrl(null);
			return;
		}
		const objectUrl = URL.createObjectURL(blob);
		setUrl(objectUrl);
		return () => URL.revokeObjectURL(objectUrl);
	}, [blob]);

	return blob ? url : null;
}
