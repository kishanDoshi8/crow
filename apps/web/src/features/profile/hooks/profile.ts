import { useQuery } from "@tanstack/react-query";
import { profileKeys } from "@/shared/constants/queryKeys";
import { getPlayerProfile } from "@/shared/lib/api";

// A player's profile across rooms. Leave playerId out (or null) for your own;
// someone else's covers only the rooms you share with them.
export const usePlayerProfile = (playerId: string | null = null, enabled = true) =>
	useQuery({
		queryKey: profileKeys.detail(playerId),
		queryFn: () => getPlayerProfile(playerId),
		enabled,
	});
