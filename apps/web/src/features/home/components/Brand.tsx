import { Link } from "react-router-dom";
import { Badge, CrowTile } from "@/shared/ui";

// The mark on the sign-in pages. It links to the landing page, so people who
// land on a form can find out what Crow is.
function Brand() {
	return (
		<>
			<Badge variant='outline' className={`b-4 border-win text-win`}>
				Beta
			</Badge>
			<div className={`flex flex-col gap-3 items-center`}>
				<Link
					to='/welcome'
					className='flex flex-col items-center gap-3 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
				>
					<CrowTile size={64} />
					<h1 className={`text-4xl font-semibold tracking-tighter`}>crow</h1>
				</Link>
				<p className={`text-muted-foreground`}>Call it. Crow about it.</p>
			</div>
		</>
	);
}

export default Brand;
