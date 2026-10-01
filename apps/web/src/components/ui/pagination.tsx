import { ChevronLeft, ChevronRight } from "lucide-solid";
import { For, Show } from "solid-js";

export type PaginationProps = {
	/** 1-based current page. */
	page: number;
	pageCount: number;
	pageSize: number;
	/** Number of items across all pages. */
	total: number;
	/** Plural noun for the range label, e.g. "leerlingen". */
	noun: string;
	onPage: (page: number) => void;
};

/**
 * Table footer with a "1–10 van 24 leerlingen" range and previous / page /
 * next buttons. Hidden when there is nothing to show.
 */
export function Pagination(props: PaginationProps) {
	const first = () => (props.page - 1) * props.pageSize + 1;
	const last = () => Math.min(props.page * props.pageSize, props.total);
	return (
		<Show when={props.total > 0}>
			<nav
				class="ds-row ds-between"
				aria-label={`Paginering ${props.noun}`}
				style={{
					padding: "12px 20px",
					"border-top": "1px solid rgb(var(--line))",
					"font-size": "0.8125rem",
					color: "rgb(var(--muted))",
					gap: "12px",
					"flex-wrap": "wrap",
				}}
			>
				<span aria-live="polite">
					{first()}–{last()} van {props.total} {props.noun}
				</span>
				<div class="ds-row" style={{ gap: "4px" }}>
					<button
						type="button"
						class="icon-btn"
						style={{ width: "32px", height: "32px" }}
						aria-label="Vorige pagina"
						disabled={props.page === 1}
						onClick={() => props.onPage(props.page - 1)}
					>
						<ChevronLeft class="size-4" aria-hidden="true" />
					</button>
					<For each={Array.from({ length: props.pageCount }, (_, i) => i + 1)}>
						{(n) => (
							<button
								type="button"
								class={n === props.page ? "btn primary" : "btn ghost"}
								style={{
									padding: "0",
									width: "32px",
									height: "32px",
									"justify-content": "center",
									"font-size": "0.8125rem",
								}}
								aria-label={`Pagina ${n}`}
								aria-current={n === props.page ? "page" : undefined}
								onClick={() => props.onPage(n)}
							>
								{n}
							</button>
						)}
					</For>
					<button
						type="button"
						class="icon-btn"
						style={{ width: "32px", height: "32px" }}
						aria-label="Volgende pagina"
						disabled={props.page === props.pageCount}
						onClick={() => props.onPage(props.page + 1)}
					>
						<ChevronRight class="size-4" aria-hidden="true" />
					</button>
				</div>
			</nav>
		</Show>
	);
}
