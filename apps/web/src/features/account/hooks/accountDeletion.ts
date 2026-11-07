import {
	cancelAccountDeletion,
	getMyAccountDeletion,
	requestAccountDeletion,
} from "@/shared/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const accountDeletionKey = ["account", "deletion"] as const;

// The caller's pending deletion request, or null.
export const useAccountDeletion = () =>
	useQuery({
		queryKey: accountDeletionKey,
		queryFn: getMyAccountDeletion,
	});

export const useRequestAccountDeletion = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (reason: string | null) => requestAccountDeletion(reason),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: accountDeletionKey }),
	});
};

export const useCancelAccountDeletion = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: cancelAccountDeletion,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: accountDeletionKey }),
	});
};
