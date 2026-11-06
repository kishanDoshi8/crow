import { Badge, CrowTile } from "@/shared/ui";

function Brand() {
	return (
		<>
			<Badge variant='outline' className={`b-4 border-win text-win`}>
				Beta v0.1
			</Badge>
			<div className={`flex flex-col gap-3 items-center`}>
				<CrowTile size={64} />
				<h1 className={`text-4xl font-semibold tracking-tighter`}>crow</h1>
				<p className={`text-muted-foreground`}>Call it. Crow about it.</p>
			</div>
		</>
	);
}

export default Brand;
