import { Avatar, AvatarFallback } from "@/shared/ui";
import { cn, initialsOf } from "@/shared/lib/utils";

type ActivityPlayerIdentityProps = {
	username: string;
	avatarSize?: "sm" | "default" | "lg";
	nameClassName?: string;
};

export function ActivityPlayerIdentity({
	username,
	avatarSize = "default",
	nameClassName,
}: Readonly<ActivityPlayerIdentityProps>) {
	return (
		<div className='flex min-w-0 items-center gap-3'>
			<Avatar size={avatarSize} className='ring-1 ring-border/80'>
				<AvatarFallback className='bg-muted/70 text-[11px] font-semibold text-foreground/85'>
					{getInitials(username)}
				</AvatarFallback>
			</Avatar>
			<span className={cn("truncate text-sm font-semibold", nameClassName)}>
				{username}
			</span>
		</div>
	);
}

function getInitials(username: string) {
	return initialsOf(username);
}
