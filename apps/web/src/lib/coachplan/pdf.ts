import { client } from "../orpc";

/** Generate a plan version's PDF on the server and download it. */
export async function downloadPlanPdf(submissionId: string): Promise<void> {
	const res = await client.coachplan.generatePdf({ id: submissionId });
	const bin = atob(res.base64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	const url = URL.createObjectURL(new Blob([bytes], { type: res.contentType }));
	const a = document.createElement("a");
	a.href = url;
	a.download = res.filename;
	a.click();
	URL.revokeObjectURL(url);
}
