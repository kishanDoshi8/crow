import { ChevronLeftIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAdminResults, useIsPlatformAdmin } from "@/features/admin/hooks";
import { isReady } from "@/features/admin/lib/results";
import { cn } from "@/shared/lib/utils";
import { Loading } from "@/shared/ui";

const TABS = [
	{ to: "/admin", label: "Results", end: true, count: true },
	{ to: "/admin/fixtures", label: "Fixtures", end: false },
	{ to: "/admin/competitions", label: "Competitions", end: false },
	{ to: "/admin/up-next", label: "Up next", end: false },
];

// /admin: the Crow team's tools for event packs. Players who open it go
// home; the server refuses every admin call from them anyway.
export default function AdminLayout() {
	const { data: isAdmin, isPending } = useIsPlatformAdmin();
	const { data: results } = useAdminResults(isAdmin === true);
	const toConfirm = results?.to_confirm.filter(isReady).length ?? 0;
	// On a phone the tabs scroll sideways: keep the open one in view.
	const navRef = useRef<HTMLElement>(null);
	const { pathname } = useLocation();
	useEffect(() => {
		navRef.current
			?.querySelector('[aria-current="page"]')
			?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}, [pathname, isAdmin]);

	if (isPending) {
		return (
			<div className='flex h-dvh items-center justify-center'>
				<Loading className='size-10 text-primary' />
			</div>
		);
	}

	if (!isAdmin) {
		return <Navigate to='/' replace />;
	}

	return (
		<div className='min-h-dvh bg-background'>
			{/* data-room-header: sticky rows on admin pages sit under it. */}
			<header data-room-header className='sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
				<div className='mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2'>
					<Link
						to='/'
						aria-label='Back to Crow'
						className='-ml-2 rounded-md p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
					>
						<ChevronLeftIcon className='size-5' />
					</Link>
					<div className='flex flex-col'>
						<h1 className='text-base font-semibold leading-tight'>Crow admin</h1>
						<span className='text-xs text-muted-foreground'>Event packs</span>
					</div>
				</div>
				<nav ref={navRef} aria-label='Admin' className='no-scrollbar mx-auto flex w-full max-w-2xl gap-1 overflow-x-auto px-4 pb-2'>
					{TABS.map((tab) => (
						<NavLink
							key={tab.to}
							to={tab.to}
							end={tab.end}
							className={({ isActive }) =>
								cn(
									"inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
									isActive
										? "bg-secondary text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)
							}
						>
							{tab.label}
							{tab.count && toConfirm > 0 ? (
								<span className='ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-bold text-primary-foreground tabular-nums'>
									{toConfirm}
								</span>
							) : null}
						</NavLink>
					))}
				</nav>
			</header>
			<main className='mx-auto w-full max-w-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]'>
				<Outlet />
			</main>
		</div>
	);
}
