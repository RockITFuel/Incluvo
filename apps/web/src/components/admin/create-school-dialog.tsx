import { useMutation, useQueryClient } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { createSignal } from "solid-js";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/text-field";
import { toast } from "../ui/toast";
import { orpc } from "../../lib/orpc";

/**
 * "Nieuwe school" (superadmin). Creates the school under Ondivera and opens
 * its page, where the next step — inviting the first keyuser — waits.
 */
export function CreateSchoolDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [name, setName] = createSignal("");

	const create = useMutation(() =>
		orpc.admin.organizations.createSchool.mutationOptions({
			onSuccess: (school) => {
				queryClient.invalidateQueries({
					queryKey: orpc.admin.organizations.key(),
				});
				props.onOpenChange(false);
				setName("");
				toast({
					title: "School aangemaakt",
					description: "Nodig nu de eerste keyuser uit.",
					tone: "success",
				});
				navigate({
					to: "/beheer/scholen/$organizationId",
					params: { organizationId: school.id },
				});
			},
			onError: () => toast({ title: "Aanmaken mislukt", tone: "danger" }),
		}),
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
						disabled={create.isPending || name().trim() === ""}
						onClick={() => create.mutate({ name: name().trim() })}
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
