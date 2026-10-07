import { useQueryClient } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { createSignal } from "solid-js";
import { useMe } from "../../lib/auth/use-me";
import { friendlyError } from "../../lib/errors";
import { client, orpc } from "../../lib/orpc";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input, Textarea } from "../ui/text-field";
import { toast } from "../ui/toast";

/**
 * "Nieuwe cursus". Ondivera (superadmin) builds an Ondivera template — closed
 * to schools until it is made available in the catalogue; a school's course
 * builder builds a school template. Opens the new course to start building.
 */
export function CreateCourseDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const me = useMe();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [title, setTitle] = createSignal("");
	const [description, setDescription] = createSignal("");
	const [busy, setBusy] = createSignal(false);

	const ondivera = () => me.is("superadmin");

	const create = async () => {
		setBusy(true);
		try {
			const course = await client.courses.create({
				kind: ondivera() ? "ondivera_template" : "school_template",
				title: title().trim(),
				description: description().trim() || undefined,
			});
			toast({ title: "Cursus aangemaakt", tone: "success" });
			props.onOpenChange(false);
			setTitle("");
			setDescription("");
			await queryClient.invalidateQueries({ queryKey: orpc.courses.list.key() });
			navigate({ to: "/cursussen/$courseId", params: { courseId: course.id } });
		} catch (err) {
			toast({ title: "Aanmaken mislukt", description: friendlyError(err), tone: "danger" });
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open={props.open}
			onOpenChange={props.onOpenChange}
			title="Nieuwe cursus"
			description={
				ondivera()
					? "Een Ondivera-cursus. Scholen zien hem pas als je hem in de catalogus beschikbaar maakt."
					: "Een cursus van jouw school."
			}
			footer={
				<>
					<Button variant="ghost" onClick={() => props.onOpenChange(false)}>
						Annuleren
					</Button>
					<Button onClick={create} disabled={busy() || !title().trim()}>
						{busy() ? "Bezig…" : "Aanmaken"}
					</Button>
				</>
			}
		>
			<div class="flex flex-col gap-3">
				<Input
					label="Titel"
					value={title()}
					onInput={(e) => setTitle(e.currentTarget.value)}
					required
				/>
				<Textarea
					label="Omschrijving"
					value={description()}
					onInput={(e) => setDescription(e.currentTarget.value)}
				/>
			</div>
		</Dialog>
	);
}
