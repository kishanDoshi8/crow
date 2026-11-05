type PreviewBet = {
	player_id: string;
	option_id: string;
	amount: number;
};

// What a player would gain if their option wins, given the bets so far, in
// whole points. Mirrors private.prediction_payouts: each losing bet gives up
// at most the winners' combined stake, and the winners share that pot by
// stake. Everyone gets the whole part of their share; the points left over
// go one each to the largest fractions (then the bigger stake, then the
// earlier bet). The new pick counts as the latest bet, so it loses ties.
export function previewWinnings(
	bets: PreviewBet[],
	playerId: string,
	optionId: string,
	amount: number,
): number {
	if (amount < 1) return 0;

	const others = bets.filter((bet) => bet.player_id !== playerId);
	const winners = [
		...others
			.filter((bet) => bet.option_id === optionId)
			.map((bet) => ({ playerId: bet.player_id, amount: bet.amount })),
		{ playerId, amount },
	];
	const winnerTotal = winners.reduce((sum, bet) => sum + bet.amount, 0);
	const pot = others
		.filter((bet) => bet.option_id !== optionId)
		.reduce((sum, bet) => sum + Math.min(bet.amount, winnerTotal), 0);

	const shares = winners.map((bet, order) => ({
		...bet,
		order,
		base: Math.floor((bet.amount * pot) / winnerTotal),
		remainder: (bet.amount * pot) % winnerTotal,
	}));
	const leftover = pot - shares.reduce((sum, share) => sum + share.base, 0);
	const ranked = [...shares].sort(
		(a, b) =>
			b.remainder - a.remainder || b.amount - a.amount || a.order - b.order,
	);
	const rank = ranked.findIndex((share) => share.playerId === playerId);
	const mine = shares[shares.length - 1];

	return mine.base + (rank < leftover ? 1 : 0);
}
