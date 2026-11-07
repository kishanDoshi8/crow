import {
	MutationCache,
	QueryCache,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { reportError } from "@/shared/lib/errorReporting";
import { CACHE_MAX_AGE } from "@/shared/lib/queryPersistence";
import { LazyMotion, MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { AuthProvider } from "@/features/auth";
import type { ReactNode } from "react";

// Every failed request and action is reported once, here, whatever the
// screen does with the error.
//
// Data counts as fresh for 30 seconds: realtime events and the result
// mutations invalidate what changes, so switching pages or apps doesn't
// refetch everything. Unused data is kept for a day so the saved cache
// (queryPersistence) has it to bring back.
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			gcTime: CACHE_MAX_AGE,
		},
	},
	queryCache: new QueryCache({
		onError: (error, query) =>
			reportError(error, { queryKey: query.queryKey }),
	}),
	mutationCache: new MutationCache({
		onError: (error, _variables, _context, mutation) =>
			reportError(error, { mutationKey: mutation.options.mutationKey }),
	}),
});

const loadMotionFeatures = () =>
	import("@/shared/lib/motionFeatures").then((module) => module.default);

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<QueryClientProvider client={queryClient}>
			{/* Respect the OS "reduce motion" setting for every animation. */}
			<MotionConfig reducedMotion='user'>
			{/* Animation features load after start-up; strict catches any
			    motion.* element that would pull them all in up front. */}
			<LazyMotion features={loadMotionFeatures} strict>
				<AuthProvider>
					{children}
					<Toaster />
				</AuthProvider>
			</LazyMotion>
			</MotionConfig>
		</QueryClientProvider>
	);
}
