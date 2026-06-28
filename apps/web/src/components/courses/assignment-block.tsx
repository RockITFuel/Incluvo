import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { Paperclip, Send, Users } from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { client, orpc } from "../../lib/orpc";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/text-field";
import { toast } from "../ui/toast";
import { FileLink } from "./file-link";
import { uploadFile } from "./upload";

type AssignmentDTO = {
	id: string;
	name: string;
	description: string | null;
	isGroup: boolean;
	responseType: "text" | "files" | "text_and_files";
	maxAttempts: number | null;
	dueAt: Date | null;
};

/**
 * Leerling-facing opdracht (#27): shows the assignment, lets them submit text
 * and/or files (#27 antwoordmogelijkheid), and lists their previous submissions
 * with any coach feedback/grade (#28).
 */
export function AssignmentBlock(props: {
	assignment: AssignmentDTO;
	courseId: string;
}) {
	const queryClient = useQueryClient();
	const [text, setText] = createSignal("");
	const [files, setFiles] = createSignal<File[]>([]);
	const [busy, setBusy] = createSignal(false);

	const submissionsQuery = useQuery(() =>
		orpc.courses.listSubmissions.queryOptions({
			input: { assignmentId: props.assignment.id },
		}),
	);

	const allowText = () => props.assignment.responseType !== "files";
	const allowFiles = () => props.assignment.responseType !== "text";

	const submit = async () => {
		setBusy(true);
		try {
			const keys: string[] = [];
			for (const f of files()) {
				keys.push(await uploadFile(f, "submission"));
			}
			await client.courses.submitAssignment({
				assignmentId: props.assignment.id,
				responseText: allowText() ? text() : undefined,
				fileStorageKeys: keys,
			});
			toast({ title: "Opdracht ingeleverd", tone: "success" });
			setText("");
			setFiles([]);
			await queryClient.invalidateQueries({
				queryKey: orpc.courses.listSubmissions.key(),
			});
		} catch (err) {
			toast({
				title: "Inleveren mislukt",
				description: (err as Error).message,
				tone: "danger",
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<div class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center gap-2">
				<h4 class="font-medium text-ink">{props.assignment.name}</h4>
				<Show when={props.assignment.isGroup}>
					<Badge variant="accent">
						<Users class="size-3" /> Groepsopdracht
					</Badge>
				</Show>
				<Show when={props.assignment.dueAt}>
					{(d) => (
						<Badge variant="warning">
							Inleveren voor {new Date(d()).toLocaleString("nl-NL")}
						</Badge>
					)}
				</Show>
			</div>
			<Show when={props.assignment.description}>
				<p class="text-body text-ink-2">{props.assignment.description}</p>
			</Show>

			{/* Submission form */}
			<div class="flex flex-col gap-2 rounded-2 border border-line bg-bg-2 p-3">
				<Show when={allowText()}>
					<Textarea
						label="Jouw antwoord"
						value={text()}
						onInput={(e) => setText(e.currentTarget.value)}
						placeholder="Typ je antwoord…"
					/>
				</Show>
				<Show when={allowFiles()}>
					<label class="flex flex-col gap-1.5 text-small font-medium text-ink-2">
						Bestanden
						<input
							type="file"
							multiple
							class="text-small text-ink-2 file:mr-3 file:rounded-2 file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-primary-700"
							onChange={(e) =>
								setFiles(Array.from(e.currentTarget.files ?? []))
							}
						/>
					</label>
					<Show when={files().length > 0}>
						<p class="text-micro text-muted">
							<Paperclip class="inline size-3" /> {files().length} bestand(en)
							geselecteerd
						</p>
					</Show>
				</Show>
				<div>
					<Button
						onClick={submit}
						disabled={busy() || (!text().trim() && files().length === 0)}
					>
						<Send class="size-4" />
						{busy() ? "Bezig…" : "Inleveren"}
					</Button>
				</div>
			</div>

			{/* Past submissions + feedback (#28) */}
			<Show when={(submissionsQuery.data?.length ?? 0) > 0}>
				<div class="flex flex-col gap-2">
					<p class="text-small font-medium text-ink-2">Jouw inzendingen</p>
					<For each={submissionsQuery.data}>
						{(s) => (
							<div class="rounded-2 border border-line p-3">
								<div class="flex items-center justify-between">
									<span class="text-small text-muted">
										Poging {s.attempt} ·{" "}
										{s.submittedAt
											? new Date(s.submittedAt).toLocaleString("nl-NL")
											: "concept"}
									</span>
									<Badge
										variant={s.status === "graded" ? "success" : "neutral"}
									>
										{s.status === "graded" ? "Beoordeeld" : "Ingeleverd"}
									</Badge>
								</div>
								<Show when={s.responseText}>
									<p class="mt-1 text-body text-ink-2">{s.responseText}</p>
								</Show>
								<Show when={s.fileStorageKeys.length > 0}>
									<div class="mt-2 flex flex-wrap gap-2">
										<For each={s.fileStorageKeys}>
											{(k) => <FileLink storageKey={k} />}
										</For>
									</div>
								</Show>
								<Show when={s.grade} keyed>
									{(g) => (
										<div class="mt-2 rounded-2 bg-success-100 p-2">
											<p class="text-small font-medium text-success">
												Feedback van je coach
												<Show when={g.grade}>
													{(gr) => <span> · cijfer {gr()}</span>}
												</Show>
											</p>
											<Show when={g.feedbackText}>
												<p class="text-body text-ink-2">{g.feedbackText}</p>
											</Show>
											<Show when={g.feedbackMediaUrl}>
												{(u) => (
													<audio controls src={u()} class="mt-1 w-full" />
												)}
											</Show>
										</div>
									)}
								</Show>
							</div>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}
