import { useRouter } from "@tanstack/solid-router";
import { createSignal } from "solid-js";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/text-field";
import { toast } from "../ui/toast";
import { createAction } from "../../lib/action";
import { client } from "../../lib/orpc";
import { refresh } from "../../lib/refresh";

/**
 * "Nieuwe school" (superadmin). Creates the school under Ondivera and opens
 * its page, where the next step — inviting the first keyuser — waits.
 */
export function CreateSchoolDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const [name, setName] = createSignal("");

	const create = createAction(
		async (input: { name: string }) => {
			const school = await client.admin.organizations.createSchool(input);
			props.onOpenChange(false);
			setName("");
			toast({
				title: "School aangemaakt",
				description: "Nodig nu de eerste keyuser uit.",
				tone: "success",
			});
			await refresh(router, "admin");
			await router.navigate({
				to: "/beheer/scholen/$organizationId",
				params: { organizationId: school.id },
			});
		},
		{ error: "Aanmaken mislukt" },
	);

	return (
		<Dialog
			open={props.open}
			onOpenChange={props.onOpenChange}
			title="Nieuwe school"
			description="De school wordt onder Ondivera aangemaakt. Daarna nodig je de keyuser uit."
			footer={
				<>
					<Button variant="subtle" onClick={() => props.onOpenChange(false)}>
						Annuleren
					</Button>
					<Button
						disabled={create.pending() || name().trim() === ""}
						onClick={() => void create.run({ name: name().trim() })}
					>
						Aanmaken
					</Button>
				</>
			}
		>
			<Input
				label="Naam van de school"
				required
				placeholder="bv. Voorbeeldcollege"
				value={name()}
				onInput={(e) => setName(e.currentTarget.value)}
			/>
		</Dialog>
	);
}
