import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";

// Signs out and goes to the login screen, or says it couldn't.
export function useSignOut() {
	const navigate = useNavigate();
	const { signOut } = useAuth();

	return async () => {
		try {
			await signOut();
			navigate("/login", { replace: true });
		} catch (error) {
			toast.error("Couldn't sign out. Try again.", {
				description: error instanceof Error ? error.message : undefined,
				position: "top-center",
			});
		}
	};
}
