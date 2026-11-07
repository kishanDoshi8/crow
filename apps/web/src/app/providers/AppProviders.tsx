import {
	MutationCache,
	QueryCache,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { reportError } from "@/shared/lib/errorReporting";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { AuthProvider } from "@/features/auth";
import type { ReactNode } from "react";

// Every failed request and action is reported once, here, whatever the
// screen does with the error.
const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) =>
			reportError(error, { queryKey: query.queryKey }),
	}),
	mutationCache: new MutationCache({
		onError: (error, _variables, _context, mutation) =>
			reportError(error, { mutationKey: mutation.options.mutationKey }),
	}),
});

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<QueryClientProvider client={queryClient}>
			{/* Respect the OS "reduce motion" setting for every animation. */}
			<MotionConfig reducedMotion='user'>
				<AuthProvider>
					{children}
					<Toaster />
				</AuthProvider>
			</MotionConfig>
		</QueryClientProvider>
	);
}
