// Why some players are "not ranked yet": the bar every player clears first.
export function RankingRuleHint({ requiredBets }: Readonly<{ requiredBets: number }>) {
	return (
		<>
			<p>
				Make {requiredBets > 0 ? requiredBets : "a few"}{" "}
				{requiredBets === 1 ? "pick" : "picks"} on questions with results in
				this series to be ranked.
			</p>
			<p className='mt-2 text-muted-foreground'>
				Only ranked players can win the series or its awards, so nobody
				tops the standings just by sitting on their starting points.
			</p>
		</>
	);
}
