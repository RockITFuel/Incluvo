import { Dynamic, type JSX } from "@solidjs/web";
import { For, omit } from "solid-js";
import {
	Accessibility as AccessibilityNode,
	Activity as ActivityNode,
	Archive as ArchiveNode,
	ArchiveRestore as ArchiveRestoreNode,
	ArrowLeft as ArrowLeftNode,
	ArrowRight as ArrowRightNode,
	Bell as BellNode,
	Bold as BoldNode,
	BookOpen as BookOpenNode,
	Building2 as Building2Node,
	Calendar as CalendarNode,
	CalendarDays as CalendarDaysNode,
	Check as CheckNode,
	CheckCheck as CheckCheckNode,
	CheckCircle2 as CheckCircle2Node,
	ChevronDown as ChevronDownNode,
	ChevronLeft as ChevronLeftNode,
	ChevronRight as ChevronRightNode,
	ChevronUp as ChevronUpNode,
	ClipboardCheck as ClipboardCheckNode,
	ClipboardList as ClipboardListNode,
	Clock as ClockNode,
	Compass as CompassNode,
	Copy as CopyNode,
	Download as DownloadNode,
	Eye as EyeNode,
	EyeOff as EyeOffNode,
	File as FileNode,
	FileText as FileTextNode,
	Flag as FlagNode,
	Flame as FlameNode,
	FlaskConical as FlaskConicalNode,
	GitBranch as GitBranchNode,
	GraduationCap as GraduationCapNode,
	GripVertical as GripVerticalNode,
	Heading2 as Heading2Node,
	Home as HomeNode,
	Info as InfoNode,
	Italic as ItalicNode,
	KeyRound as KeyRoundNode,
	Languages as LanguagesNode,
	LayoutDashboard as LayoutDashboardNode,
	Lightbulb as LightbulbNode,
	List as ListNode,
	ListChecks as ListChecksNode,
	ListOrdered as ListOrderedNode,
	LogOut as LogOutNode,
	Mail as MailNode,
	Menu as MenuNode,
	MessageCircle as MessageCircleNode,
	MessageSquare as MessageSquareNode,
	Mic as MicNode,
	NotebookPen as NotebookPenNode,
	Paperclip as PaperclipNode,
	Pencil as PencilNode,
	PlayCircle as PlayCircleNode,
	Plus as PlusNode,
	RotateCw as RotateCwNode,
	Save as SaveNode,
	School as SchoolNode,
	Search as SearchNode,
	Send as SendNode,
	Settings as SettingsNode,
	Sparkles as SparklesNode,
	Square as SquareNode,
	Star as StarNode,
	Tags as TagsNode,
	Trash2 as Trash2Node,
	TrendingUp as TrendingUpNode,
	TriangleAlert as TriangleAlertNode,
	Upload as UploadNode,
	User as UserNode,
	UserPlus as UserPlusNode,
	UserRound as UserRoundNode,
	Users as UsersNode,
	UsersRound as UsersRoundNode,
	Video as VideoNode,
	X as XNode,
	XCircle as XCircleNode,
	type IconNode,
} from "lucide";

/**
 * Lucide icons as Solid 2 components. `lucide-solid` targets Solid 1, so the
 * geometry comes from vanilla `lucide` and this renderer draws it (ported from
 * project-alpha's packages/ui/src/adapters/lucide). Add an icon by adding it to
 * the import and the export list below.
 */

export type LucideProps = JSX.SvgSVGAttributes<SVGSVGElement> & {
	size?: number | string;
	strokeWidth?: number | string;
	absoluteStrokeWidth?: boolean;
};

export type Icon = (props: LucideProps) => JSX.Element;

function createIcon(name: string, nodes: IconNode): Icon {
	return function LucideIcon(props: LucideProps) {
		const rest = omit(props, "color", "size", "strokeWidth", "children", "class", "absoluteStrokeWidth");
		// Decorative unless it was given an accessible name.
		const named = () =>
			Object.keys(rest).some((key) => key.startsWith("aria-") || key === "role" || key === "title");
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width={props.size ?? 24}
				height={props.size ?? 24}
				viewBox="0 0 24 24"
				fill="none"
				stroke={typeof props.color === "string" ? props.color : "currentColor"}
				stroke-width={
					props.absoluteStrokeWidth
						? (Number(props.strokeWidth ?? 2) * 24) / Number(props.size ?? 24)
						: Number(props.strokeWidth ?? 2)
				}
				stroke-linecap="round"
				stroke-linejoin="round"
				class={["lucide", `lucide-${name}`, props.class]}
				aria-hidden={!props.children && !named() ? "true" : undefined}
				{...rest}
			>
				<For each={nodes}>{([tag, attributes]) => <Dynamic component={tag} {...attributes} />}</For>
			</svg>
		);
	};
}

export const Accessibility = createIcon("accessibility", AccessibilityNode);
export const Activity = createIcon("activity", ActivityNode);
export const Archive = createIcon("archive", ArchiveNode);
export const ArchiveRestore = createIcon("archive-restore", ArchiveRestoreNode);
export const ArrowLeft = createIcon("arrow-left", ArrowLeftNode);
export const ArrowRight = createIcon("arrow-right", ArrowRightNode);
export const Bell = createIcon("bell", BellNode);
export const Bold = createIcon("bold", BoldNode);
export const BookOpen = createIcon("book-open", BookOpenNode);
export const Building2 = createIcon("building-2", Building2Node);
export const Calendar = createIcon("calendar", CalendarNode);
export const CalendarDays = createIcon("calendar-days", CalendarDaysNode);
export const Check = createIcon("check", CheckNode);
export const CheckCheck = createIcon("check-check", CheckCheckNode);
export const CheckCircle2 = createIcon("check-circle-2", CheckCircle2Node);
export const ChevronDown = createIcon("chevron-down", ChevronDownNode);
export const ChevronLeft = createIcon("chevron-left", ChevronLeftNode);
export const ChevronRight = createIcon("chevron-right", ChevronRightNode);
export const ChevronUp = createIcon("chevron-up", ChevronUpNode);
export const ClipboardCheck = createIcon("clipboard-check", ClipboardCheckNode);
export const ClipboardList = createIcon("clipboard-list", ClipboardListNode);
export const Clock = createIcon("clock", ClockNode);
export const Compass = createIcon("compass", CompassNode);
export const Copy = createIcon("copy", CopyNode);
export const Download = createIcon("download", DownloadNode);
export const Eye = createIcon("eye", EyeNode);
export const EyeOff = createIcon("eye-off", EyeOffNode);
export const File = createIcon("file", FileNode);
export const FileText = createIcon("file-text", FileTextNode);
export const Flag = createIcon("flag", FlagNode);
export const Flame = createIcon("flame", FlameNode);
export const FlaskConical = createIcon("flask-conical", FlaskConicalNode);
export const GitBranch = createIcon("git-branch", GitBranchNode);
export const GraduationCap = createIcon("graduation-cap", GraduationCapNode);
export const GripVertical = createIcon("grip-vertical", GripVerticalNode);
export const Heading2 = createIcon("heading-2", Heading2Node);
export const Home = createIcon("home", HomeNode);
export const Info = createIcon("info", InfoNode);
export const Italic = createIcon("italic", ItalicNode);
export const KeyRound = createIcon("key-round", KeyRoundNode);
export const Languages = createIcon("languages", LanguagesNode);
export const LayoutDashboard = createIcon("layout-dashboard", LayoutDashboardNode);
export const Lightbulb = createIcon("lightbulb", LightbulbNode);
export const List = createIcon("list", ListNode);
export const ListChecks = createIcon("list-checks", ListChecksNode);
export const ListOrdered = createIcon("list-ordered", ListOrderedNode);
export const LogOut = createIcon("log-out", LogOutNode);
export const Mail = createIcon("mail", MailNode);
export const Menu = createIcon("menu", MenuNode);
export const MessageCircle = createIcon("message-circle", MessageCircleNode);
export const MessageSquare = createIcon("message-square", MessageSquareNode);
export const Mic = createIcon("mic", MicNode);
export const NotebookPen = createIcon("notebook-pen", NotebookPenNode);
export const Paperclip = createIcon("paperclip", PaperclipNode);
export const Pencil = createIcon("pencil", PencilNode);
export const PlayCircle = createIcon("play-circle", PlayCircleNode);
export const Plus = createIcon("plus", PlusNode);
export const RotateCw = createIcon("rotate-cw", RotateCwNode);
export const Save = createIcon("save", SaveNode);
export const School = createIcon("school", SchoolNode);
export const Search = createIcon("search", SearchNode);
export const Send = createIcon("send", SendNode);
export const Settings = createIcon("settings", SettingsNode);
export const Sparkles = createIcon("sparkles", SparklesNode);
export const Square = createIcon("square", SquareNode);
export const Star = createIcon("star", StarNode);
export const Tags = createIcon("tags", TagsNode);
export const Trash2 = createIcon("trash-2", Trash2Node);
export const TrendingUp = createIcon("trending-up", TrendingUpNode);
export const TriangleAlert = createIcon("triangle-alert", TriangleAlertNode);
export const Upload = createIcon("upload", UploadNode);
export const User = createIcon("user", UserNode);
export const UserPlus = createIcon("user-plus", UserPlusNode);
export const UserRound = createIcon("user-round", UserRoundNode);
export const Users = createIcon("users", UsersNode);
export const UsersRound = createIcon("users-round", UsersRoundNode);
export const Video = createIcon("video", VideoNode);
export const X = createIcon("x", XNode);
export const XCircle = createIcon("xcircle", XCircleNode);

/** Brand icon, removed from lucide 1.x; geometry from lucide 0.544. */
export const Youtube = createIcon("youtube", [
	["path", { d: "M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" }],
	["path", { d: "m10 15 5-3-5-3z" }],
]);
