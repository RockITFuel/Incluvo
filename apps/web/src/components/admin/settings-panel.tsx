import { useMutation, useQuery } from "@tanstack/solid-query";
import { createEffect, createSignal, Show } from "solid-js";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/text-field";
import { Switch } from "../ui/switch";
import { toast } from "../ui/toast";
import { orpc } from "../../lib/orpc";

/**
 * Bewaartermijnen / instellingen (#4, AVG). The server has NO settings table
 * yet, so `getRetention` returns documented defaults (`persisted: false`) and
 * `updateRetention` is a stub that rejects. We render the intended shape and
 * show a clear notice. See "ORCHESTRATOR TODO".
 */
export function SettingsPanel() {
	const settingsQuery = useQuery(() =>
		orpc.admin.settings.getRetention.queryOptions(),
	);

	const [coachplan, setCoachplan] = createSignal("");
	const [chat, setChat] = createSignal("");
	const [recording, setRecording] = createSignal("");
	const [transcript, setTranscript] = createSignal("");
	const [deleteRec, setDeleteRec] = createSignal(true);

	// Seed the local form from the server defaults once they load.
	createEffect(() => {
		const d = settingsQuery.data;
		if (d) {
			setCoachplan(String(d.coachplanRetentionDays));
			setChat(String(d.chatRetentionDays));
			setRecording(String(d.recordingRetentionDays));
			setTranscript(String(d.transcriptRetentionDays));
			setDeleteRec(d.deleteRecordingAfterTranscription);
		}
	});

	const update = useMutation(() =>
		orpc.admin.settings.updateRetention.mutationOptions({
			onSuccess: () => toast({ title: "Opgeslagen", tone: "success" }),
			onError: (err) =>
				toast({
					title: "Nog niet beschikbaar",
					description: err.message,
					tone: "warning",
				}),
		}),
	);

	return (
		<section class="flex flex-col gap-4">
			<div>
				<h2 class="font-head text-h3 text-ink">Instellingen</h2>
				<p class="mt-1 text-small text-muted">
					Bewaartermijnen voor coachplannen, chats, opnames en
					transcripties (AVG, #4).
				</p>
			</div>

			<Show when={settingsQuery.data && !settingsQuery.data.persisted}>
				<Card
					padding="sm"
					class="border-warning bg-warning-100 text-small text-ink-2"
				>
					Let op: deze waarden zijn standaardwaarden en worden nog niet
					opgeslagen. Er ontbreekt een instellingen-/bewaartermijnentabel in
					het datamodel (zie ORCHESTRATOR TODO).
				</Card>
			</Show>

			<Show when={settingsQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>

			<Card padding="md" class="flex flex-col gap-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<Input
						label="Coachplannen (dagen)"
						type="number"
						value={coachplan()}
						onInput={(e) => setCoachplan(e.currentTarget.value)}
					/>
					<Input
						label="Chats (dagen)"
						type="number"
						value={chat()}
						onInput={(e) => setChat(e.currentTarget.value)}
					/>
					<Input
						label="Opnames (dagen)"
						type="number"
						value={recording()}
						onInput={(e) => setRecording(e.currentTarget.value)}
					/>
					<Input
						label="Transcripties (dagen)"
						type="number"
						value={transcript()}
						onInput={(e) => setTranscript(e.currentTarget.value)}
					/>
				</div>

				<Switch
					checked={deleteRec()}
					onChange={setDeleteRec}
					label="Opname verwijderen na transcriptie"
				/>

				<div class="flex justify-end">
					<Button
						disabled={update.isPending}
						onClick={() =>
							update.mutate({
								coachplanRetentionDays: Number(coachplan()) || 0,
								chatRetentionDays: Number(chat()) || 0,
								recordingRetentionDays: Number(recording()) || 0,
								transcriptRetentionDays: Number(transcript()) || 0,
								deleteRecordingAfterTranscription: deleteRec(),
							})
						}
					>
						Opslaan
					</Button>
				</div>
			</Card>
		</section>
	);
}
