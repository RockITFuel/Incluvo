import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { Mic, Star } from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { client, orpc } from "../../lib/orpc";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input, Textarea } from "../ui/text-field";
import { toast } from "../ui/toast";
import { FileLink } from "./file-link";
import { uploadFile } from "./upload";
import type { BlockDTO } from "./block-view";

type Section = { id: string; title: string; blocks: BlockDTO[] };

/**
 * Coach grading view (#28). Lists every opdracht in the course; for each it shows
 * the leerling submissions and a grade form (feedback text + optional cijfer +
 * optional voice/video note). Gated to coach+ by the route.
 */
export function GradingView(props: { sections: Section[] }) {
	const assignments = () =>
		props.sections
			.flatMap((s) => s.blocks)
			.filter((b) => b.type === "opdracht" && b.assignment)
			.map((b) => b.assignment!);

	return (
		<div class="flex flex-col gap-4">
			<Show
				when={assignments().length > 0}
				fallback={<Card class="text-muted">Deze cursus heeft geen opdrachten.</Card>}
			>
				<For each={assignments()}>
					{(a) => <AssignmentGrading assignment={a} />}
				</For>
			</Show>
		</div>
	);
}

function AssignmentGrading(props: {
	assignment: NonNullable<BlockDTO["assignment"]>;
}) {
	const submissionsQuery = useQuery(() =>
		orpc.courses.listSubmissions.queryOptions({
			input: { assignmentId: props.assignment.id },
		}),
	);

	return (
		<Card class="flex flex-col gap-3">
			<div class="flex items-center justify-between">
				<h3 class="font-head text-h3 text-ink">{props.assignment.name}</h3>
				<Badge variant="neutral">
					{submissionsQuery.data?.length ?? 0} inzending(en)
				</Badge>
			</div>
			<Show
				when={(submissionsQuery.data?.length ?? 0) > 0}
				fallback={<p class="text-small text-muted">Nog geen inzendingen.</p>}
			>
				<For each={submissionsQuery.data}>
					{(s) => <SubmissionRow submission={s} />}
				</For>
			</Show>
		</Card>
	);
}

type Submission = {
	id: string;
	leerlingName: string | null;
	attempt: number;
	status: string;
	responseText: string | null;
	fileStorageKeys: string[];
	submittedAt: Date | null;
	grade: {
		id: string;
		grade: string | null;
		feedbackText: string | null;
		feedbackMediaUrl: string | null;
	} | null;
};

function SubmissionRow(props: { submission: Submission }) {
	const queryClient = useQueryClient();
	const [grade, setGrade] = createSignal(props.submission.grade?.grade ?? "");
	const [feedback, setFeedback] = createSignal(
		props.submission.grade?.feedbackText ?? "",
	);
	const [mediaKey, setMediaKey] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);

	const handleMedia = async (file: File) => {
		try {
			const key = await uploadFile(file, "feedback");
			setMediaKey(key);
			toast({ title: "Notitie geüpload", tone: "success" });
		} catch (err) {
			toast({
				title: "Upload mislukt",
				description: (err as Error).message,
				tone: "danger",
			});
		}
	};

	const save = async () => {
		setBusy(true);
		try {
			await client.courses.gradeSubmission({
				submissionId: props.submission.id,
				grade: grade() || undefined,
				feedbackText: feedback() || undefined,
				feedbackMediaStorageKey: mediaKey() ?? undefined,
			});
			toast({ title: "Beoordeling opgeslagen", tone: "success" });
			await queryClient.invalidateQueries({
				queryKey: orpc.courses.listSubmissions.key(),
			});
		} catch (err) {
			toast({
				title: "Beoordelen mislukt",
				description: (err as Error).message,
				tone: "danger",
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<div class="rounded-2 border border-line p-3">
			<div class="mb-2 flex items-center justify-between">
				<span class="font-medium text-ink">
					{props.submission.leerlingName ?? "Leerling"} · poging{" "}
					{props.submission.attempt}
				</span>
				<Badge variant={props.submission.grade ? "success" : "warning"}>
					{props.submission.grade ? "Beoordeeld" : "Te beoordelen"}
				</Badge>
			</div>
			<Show when={props.submission.responseText}>
				<p class="mb-2 rounded-2 bg-bg-2 p-2 text-body text-ink-2">
					{props.submission.responseText}
				</p>
			</Show>
			<Show when={props.submission.fileStorageKeys.length > 0}>
				<div class="mb-2 flex flex-wrap gap-2">
					<For each={props.submission.fileStorageKeys}>
						{(k) => <FileLink storageKey={k} />}
					</For>
				</div>
			</Show>

			<div class="flex flex-col gap-2 border-t border-line pt-2">
				<div class="flex items-end gap-2">
					<Input
						class="w-32"
						label="Cijfer (optioneel)"
						value={grade()}
						onInput={(e) => setGrade(e.currentTarget.value)}
						placeholder="bv. 8 of voldoende"
					/>
					<label class="flex flex-col gap-1.5 text-small font-medium text-ink-2">
						<span class="inline-flex items-center gap-1">
							<Mic class="size-3" /> Spraak-/videobericht
						</span>
						<input
							type="file"
							accept="audio/*,video/*"
							class="text-micro file:mr-2 file:rounded-2 file:border-0 file:bg-primary-50 file:px-2 file:py-1 file:text-primary-700"
							onChange={(e) => {
								const f = e.currentTarget.files?.[0];
								if (f) handleMedia(f);
							}}
						/>
					</label>
				</div>
				<Textarea
					label="Feedback"
					value={feedback()}
					onInput={(e) => setFeedback(e.currentTarget.value)}
				/>
				<div>
					<Button onClick={save} disabled={busy()}>
						<Star class="size-4" />
						{busy() ? "Bezig…" : "Beoordeling opslaan"}
					</Button>
				</div>
			</div>
		</div>
	);
}
