import { Skeleton } from "@/shared/ui";

// Two competition rows while they load.
export function ListSkeleton() {
	return [0, 1].map((row) => (
		<div key={row} aria-hidden='true' className='flex items-center gap-3 px-3 py-3'>
			<Skeleton className='size-10 rounded-lg' />
			<div className='flex flex-1 flex-col gap-2'>
				<Skeleton className='h-3.5 w-1/2' />
				<Skeleton className='h-3 w-3/4' />
			</div>
		</div>
	));
}
