// Mirrors the checks in create_series / update_series.
export function getSeriesPointsError(startingStack: string, weeklyTopup: string) {
	const stack = Number(startingStack);
	const topup = Number(weeklyTopup);

	if (!Number.isInteger(stack) || stack < 100) {
		return "Starting points must be a whole number of at least 100.";
	}

	if (!Number.isInteger(topup) || topup < 0) {
		return "Weekly top-up must be a whole number of 0 or more.";
	}

	return "";
}

// Mirrors the check on min_bets_to_rank.
export function getMinBetsError(minBetsToRank: string) {
	const value = Number(minBetsToRank);
	if (minBetsToRank.trim() === "" || !Number.isInteger(value) || value < 0 || value > 50) {
		return "Picks to rank must be a whole number from 0 to 50.";
	}
	return "";
}
