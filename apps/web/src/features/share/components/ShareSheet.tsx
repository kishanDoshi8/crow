import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";
import {
	Button,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	Spinner,
} from "@/shared/ui";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { recordShare } from "@/shared/lib/api";
import type { ShareKind } from "@/shared/lib/referral";
import { CARD_SIZE, type CardFormat } from "@/features/share/tokens";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	// The message sent alongside the image, e.g. "Called it on Crow".
	message: string;
	link: string;
	kind: ShareKind;
	roomId: string;
	fileName: string;
	renderCard: (format: CardFormat) => ReactNode;
};

const PREVIEW_WIDTH = 264;

// Shows the card as it will be shared, lets the player pick a post or story
// format, and shares the image together with a link back into the room.
// The image renderer is only needed to share, so it loads when a share sheet
// opens rather than with the app.
const loadHtmlToImage = () => import("html-to-image");

export function ShareSheet({
	open,
	onOpenChange,
	title,
	description,
	message,
	link,
	kind,
	roomId,
	fileName,
	renderCard,
}: Readonly<Props>) {
	const [format, setFormat] = useState<CardFormat>("chat");
	const [isSharing, setIsSharing] = useState(false);
	const [copied, setCopied] = useState(false);
	const captureRef = useRef<HTMLDivElement>(null);
	// The drawer mounts its content after opening, so measure from a callback ref.
	const [previewNode, setPreviewNode] = useState<HTMLDivElement | null>(null);
	const { width } = CARD_SIZE[format];
	const scale = PREVIEW_WIDTH / width;
	// Chat images are as tall as their content, so the preview measures it.
	const [previewHeight, setPreviewHeight] = useState(0);

	useLayoutEffect(() => {
		if (!previewNode) return;
		const measure = () => setPreviewHeight(previewNode.offsetHeight);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(previewNode);
		return () => observer.disconnect();
	}, [previewNode]);

	const logShare = () => {
		recordShare(roomId, kind).catch(() => {
			// Counting shares is best-effort.
		});
	};

	const copyLink = async () => {
		const ok = await copyToClipboard(link);
		if (ok) {
			setCopied(true);
			globalThis.setTimeout(() => setCopied(false), 2000);
			toast.success("Link copied", { position: "top-center" });
		} else {
			toast.error("Copy isn't available here.", { position: "top-center" });
		}
		return ok;
	};

	// Start loading the renderer as the sheet opens, so tapping Share doesn't
	// wait on it (Safari only allows sharing shortly after the tap).
	useEffect(() => {
		if (open) void loadHtmlToImage();
	}, [open]);

	const share = async () => {
		const node = captureRef.current;
		if (!node) return;
		setIsSharing(true);
		try {
			const [{ toBlob }] = await Promise.all([
				loadHtmlToImage(),
				document.fonts.ready,
			]);
			const blob = await toBlob(node, {
				pixelRatio: 1,
				cacheBust: true,
				width,
				height: node.offsetHeight,
			});
			if (!blob) throw new Error("Couldn't make the image.");
			const file = new File([blob], `${fileName}-${format}.png`, { type: "image/png" });
			const text = `${message}\n${link}`;

			if (navigator.canShare?.({ files: [file], text })) {
				try {
					await navigator.share({ files: [file], text });
					logShare();
				} catch (error) {
					if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
				}
				return;
			}

			// No file sharing here: save the image and put the link on the clipboard.
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = file.name;
			anchor.click();
			globalThis.setTimeout(() => URL.revokeObjectURL(url), 10_000);
			const linkCopied = await copyToClipboard(link);
			logShare();
			toast.success(
				linkCopied ? "Image saved and link copied" : "Image saved",
				{
					description: "Post the image and paste the link with it.",
					position: "top-center",
				},
			);
		} catch (error) {
			toast.error("Couldn't share the image.", {
				description: error instanceof Error ? error.message : undefined,
				position: "top-center",
			});
		} finally {
			setIsSharing(false);
		}
	};

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className='sm:max-w-md mx-auto'>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					<DrawerDescription>{description}</DrawerDescription>
				</DrawerHeader>
				<div className='flex flex-col items-center gap-4 px-4 pb-6'>
					<ToggleGroup
						type='single'
						variant='outline'
						value={format}
						onValueChange={(value) => value && setFormat(value as CardFormat)}
						aria-label='Image format'
					>
						<ToggleGroupItem value='chat' className='px-4'>
							Chat
						</ToggleGroupItem>
						<ToggleGroupItem value='story' className='px-4'>
							Story
						</ToggleGroupItem>
					</ToggleGroup>

					<div
						className='max-h-[40vh] overflow-y-auto rounded-lg border'
						style={{ width: PREVIEW_WIDTH }}
						aria-label='Preview of the image'
						role='img'
					>
						<div
							style={{
								width: PREVIEW_WIDTH,
								height: previewHeight * scale,
								overflow: "hidden",
							}}
						>
							<div
								ref={setPreviewNode}
								className='dark'
								style={{
									width,
									transform: `scale(${scale})`,
									transformOrigin: "top left",
									pointerEvents: "none",
								}}
							>
								{renderCard(format)}
							</div>
						</div>
					</div>

					<div className='flex w-full gap-2'>
						<Button
							variant='outline'
							className='flex-1'
							onClick={() => void copyLink()}
						>
							{copied ? <CheckIcon /> : <CopyIcon />}
							Copy link
						</Button>
						<Button
							variant='linear'
							className='flex-1'
							onClick={() => void share()}
							disabled={isSharing}
						>
							{isSharing ? <Spinner /> : <Share2Icon />}
							Share image
						</Button>
					</div>
				</div>
				{open
					? createPortal(
							<div
								aria-hidden='true'
								style={{
									position: "fixed",
									left: -20_000,
									top: 0,
									pointerEvents: "none",
								}}
							>
								<div ref={captureRef} className='dark' style={{ width }}>
									{renderCard(format)}
								</div>
							</div>,
							document.body,
						)
					: null}
			</DrawerContent>
		</Drawer>
	);
}
