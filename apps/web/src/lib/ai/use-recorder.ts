import { createSignal, onCleanup } from "solid-js";

/**
 * Minimal audio recorder for the transcription demo (#18). Uses the browser
 * MediaRecorder API to capture a coachgesprek (fysiek of via Teams/Zoom via de
 * systeemmicrofoon). Produces a base64 blob the server can forward to the
 * transcription provider, plus a local object URL for playback.
 *
 * Recording is entirely client-side until the coach explicitly sends it; the
 * server only ever stores the transcript text, and the source audio key can be
 * cleared afterwards (privacy §4.3).
 */
export function useRecorder() {
	const [recording, setRecording] = createSignal(false);
	const [audioUrl, setAudioUrl] = createSignal<string | null>(null);
	const [audioBase64, setAudioBase64] = createSignal<string | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [supported] = createSignal(
		typeof window !== "undefined" &&
			typeof navigator !== "undefined" &&
			!!navigator.mediaDevices?.getUserMedia &&
			typeof MediaRecorder !== "undefined",
	);

	let recorder: MediaRecorder | undefined;
	let chunks: BlobPart[] = [];
	let stream: MediaStream | undefined;

	async function start() {
		setError(null);
		if (!supported()) {
			setError("Opnemen wordt niet ondersteund in deze browser.");
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			recorder = new MediaRecorder(stream);
			chunks = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunks.push(e.data);
			};
			recorder.onstop = async () => {
				const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
				setAudioUrl(URL.createObjectURL(blob));
				const buffer = await blob.arrayBuffer();
				setAudioBase64(arrayBufferToBase64(buffer));
				stream?.getTracks().forEach((t) => t.stop());
				stream = undefined;
			};
			recorder.start();
			setRecording(true);
		} catch {
			setError("Geen toegang tot de microfoon.");
		}
	}

	function stop() {
		if (recorder && recorder.state !== "inactive") recorder.stop();
		setRecording(false);
	}

	function reset() {
		const url = audioUrl();
		if (url) URL.revokeObjectURL(url);
		setAudioUrl(null);
		setAudioBase64(null);
	}

	onCleanup(() => {
		stream?.getTracks().forEach((t) => t.stop());
		const url = audioUrl();
		if (url) URL.revokeObjectURL(url);
	});

	return { recording, audioUrl, audioBase64, error, supported, start, stop, reset };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}
