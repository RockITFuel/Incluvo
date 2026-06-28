import { TextField as KTextField } from "@kobalte/core/text-field";
import { type JSX, Show, splitProps } from "solid-js";
import { cn } from "../../lib/cn";

const controlClass =
	"w-full rounded-2 border border-line bg-surface px-ctl-x py-ctl-y text-body text-ink placeholder:text-muted-2 transition-colors duration-fast focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-danger";

type FieldShellProps = {
	label?: string;
	description?: string;
	error?: string;
	class?: string;
	name?: string;
	value?: string;
	required?: boolean;
	disabled?: boolean;
};

function Label(props: { label?: string; required?: boolean }) {
	return (
		<Show when={props.label}>
			<KTextField.Label class="text-small font-medium text-ink-2">
				{props.label}
				<Show when={props.required}>
					<span class="text-danger"> *</span>
				</Show>
			</KTextField.Label>
		</Show>
	);
}

function Meta(props: { description?: string; error?: string }) {
	return (
		<>
			<Show when={props.description}>
				<KTextField.Description class="text-micro text-muted">
					{props.description}
				</KTextField.Description>
			</Show>
			<Show when={props.error}>
				<KTextField.ErrorMessage class="text-micro text-danger">
					{props.error}
				</KTextField.ErrorMessage>
			</Show>
		</>
	);
}

export type InputProps = FieldShellProps & {
	type?: string;
	placeholder?: string;
	onInput?: JSX.EventHandler<HTMLInputElement, InputEvent>;
	onChange?: (value: string) => void;
	inputClass?: string;
};

/** Text input with accessible label/description/error wiring via Kobalte. */
export function Input(props: InputProps) {
	const [field, input] = splitProps(props, [
		"label",
		"description",
		"error",
		"class",
		"name",
		"value",
		"required",
		"disabled",
		"onChange",
	]);
	const [el] = splitProps(input, ["type", "placeholder", "onInput"]);
	return (
		<KTextField
			class={cn("flex flex-col gap-1.5", field.class)}
			name={field.name}
			value={field.value}
			required={field.required}
			disabled={field.disabled}
			validationState={field.error ? "invalid" : "valid"}
			onChange={field.onChange}
		>
			<Label label={field.label} required={field.required} />
			<KTextField.Input
				type={el.type ?? "text"}
				placeholder={el.placeholder}
				onInput={el.onInput}
				class={cn(controlClass, input.inputClass)}
			/>
			<Meta description={field.description} error={field.error} />
		</KTextField>
	);
}

export type TextareaProps = FieldShellProps & {
	placeholder?: string;
	rows?: number;
	onInput?: JSX.EventHandler<HTMLTextAreaElement, InputEvent>;
	onChange?: (value: string) => void;
};

/** Multi-line text input with the same accessible wiring. */
export function Textarea(props: TextareaProps) {
	const [field, el] = splitProps(props, [
		"label",
		"description",
		"error",
		"class",
		"name",
		"value",
		"required",
		"disabled",
		"onChange",
	]);
	return (
		<KTextField
			class={cn("flex flex-col gap-1.5", field.class)}
			name={field.name}
			value={field.value}
			required={field.required}
			disabled={field.disabled}
			validationState={field.error ? "invalid" : "valid"}
			onChange={field.onChange}
		>
			<Label label={field.label} required={field.required} />
			<KTextField.TextArea
				placeholder={el.placeholder}
				rows={el.rows ?? 4}
				onInput={el.onInput}
				class={cn(controlClass, "min-h-24 resize-y")}
			/>
			<Meta description={field.description} error={field.error} />
		</KTextField>
	);
}
