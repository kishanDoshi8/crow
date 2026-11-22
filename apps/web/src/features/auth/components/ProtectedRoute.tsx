import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/context/AuthContext";
import { Loading } from "@/shared/ui/spinner";
import { savePostAuthRedirect } from "@/shared/lib/postAuthRedirect";

export function ProtectedRoute() {
	const { user, isLoading } = useAuth();
	const location = useLocation();

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-dvh'>
				<Loading className='size-10 text-primary' />
			</div>
		);
	}

	if (!user) {
		// Visitors at the bare address get the landing page, not a sign-in form,
		// keeping ?ref= so analytics knows where they came from. A link to a Home
		// tab (?tab=join) still asks them to sign in first.
		if (location.pathname === "/" && !new URLSearchParams(location.search).has("tab")) {
			return <Navigate to={`/welcome${location.search}`} replace />;
		}
		// Remember the page (e.g. an invite link) through signup and Google sign-in.
		savePostAuthRedirect(location.pathname + location.search);
		return <Navigate to='/login' state={{ from: location }} replace />;
	}

	return <Outlet />;
}
