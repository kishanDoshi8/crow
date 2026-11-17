import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui";
import { cn, formatSignedPoints } from "@/shared/lib/utils";
import { CoinsIcon } from "lucide-react";
import type { SeriesWallet } from "@/shared/lib/api";

type Props = {
	wallet: SeriesWallet;
};

// Header points chip; tapping explains where the number comes from.
export function WalletPopover({ wallet }: Readonly<Props>) {
	const rows: Array<[string, string, string?]> = [
		["Free to use", wallet.available.toLocaleString()],
		["On open picks", wallet.escrow.toLocaleString()],
		[
			"Net this series",
			formatSignedPoints(wallet.net_profit),
			wallet.net_profit > 0
				? "text-win"
				: wallet.net_profit < 0
					? "text-loss"
					: undefined,
		],
		["Starting points", wallet.starting_stack.toLocaleString()],
	];

	const topup = topupStatus(wallet);

	return (
		<Popover>
			<PopoverTrigger
				className='flex items-center gap-1.5 rounded-full px-3 h-9 text-accent font-semibold tabular-nums hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
				aria-label={`${wallet.balance.toLocaleString()} points in ${wallet.title}`}
			>
				<CoinsIcon className='size-4' />
				{wallet.balance.toLocaleString()}
			</PopoverTrigger>
			<PopoverContent align='end' className='w-64'>
				<p className='text-xs text-muted-foreground'>Your points in</p>
				<p className='font-semibold truncate'>{wallet.title}</p>
				<div className='mt-3 flex flex-col gap-2 text-sm'>
					{rows.map(([label, value, tone]) => (
						<div key={label} className='flex justify-between gap-3'>
							<dt className='text-muted-foreground'>{label}</dt>
							<dd
								className={cn("tabular-nums font-medium", tone)}
							>
								{value}
							</dd>
						</div>
					))}
				</div>
				{topup ? (
					<p
						className={cn(
							"mt-3 rounded-md px-2 py-1.5 text-xs",
							topup.tone,
						)}
					>
						{topup.message}
					</p>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

// Where the player stands for next Monday's top-up (private.pay_series_topups):
// it goes to anyone who bet in the series this week, or who has run out.
function topupStatus(wallet: SeriesWallet) {
	if (wallet.status !== "active" || wallet.weekly_topup <= 0) return null;
	const amount = `+${wallet.weekly_topup.toLocaleString()}`;

	if (wallet.bet_this_week) {
		return {
			message: `${amount} lands Monday. You've picked this week.`,
			tone: "bg-win/10 text-win",
		};
	}
	if (wallet.available <= 0) {
		return {
			message: `${amount} on Monday to get you back in.`,
			tone: "bg-muted text-foreground",
		};
	}
	return {
		message: `Make a pick before Monday to get ${amount}.`,
		tone: "bg-accent/10 text-foreground",
	};
}

