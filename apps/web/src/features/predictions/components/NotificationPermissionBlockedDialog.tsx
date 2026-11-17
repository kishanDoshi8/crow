import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function NotificationPermissionBlockedDialog({
	open,
	onOpenChange,
}: Readonly<Props>) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Notifications disabled</DialogTitle>
					<DialogDescription>
						Notifications are blocked in your browser.
						<br />
						<br />
						To get updates and reminders about your questions, enable
						notifications from your browser settings and then return
						to the app.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
