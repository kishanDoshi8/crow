import { Suspense, lazy, type ReactElement } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { HomePage } from "@/features/home/HomePage";
import { ProtectedRoute } from "@/features/auth";
import { AuthCallbackPage } from "@/features/auth/pages/AuthCallbackPage";
import { RouteFallback } from "@/app/router/RouteFallback";
import { RouteErrorBoundary } from "@/app/router/RouteErrorBoundary";
import { AppShell } from "@/app/router/AppShell";
import RoomLayout from "@/app/layouts/RoomLayout";
import RoomTabsLayout from "@/app/layouts/RoomTabsLayout";
import { RequireRoomMember } from "@/features/rooms";
import { FEATURES } from "@/shared/constants/features";
// The pages people move between inside a room load with the app, so switching
// tabs never waits on a code download. Rarely used pages stay lazy.
import RoomDashboard from "@/features/rooms/pages/RoomDashboard";
import RoomHistoryPage from "@/features/rooms/pages/RoomHistoryPage";
import RoomActivitiesPage from "@/features/rooms/pages/RoomActivitiesPage";
import SeriesPage from "@/features/series/pages/SeriesPage";
import { PredictionPage } from "@/features/predictions/pages/PredictionPage";
import { LeaderboardPage } from "@/features/leaderboard/pages/LeaderboardPage";

const UpNextPage = lazy(() => import("@/features/series/pages/UpNextPage"));
const DeleteAccountPage = lazy(
	() => import("@/features/account/pages/DeleteAccountPage"),
);
const LoginPage = lazy(() =>
	import("@/features/auth/pages/LoginPage").then((module) => ({
		default: module.LoginPage,
	})),
);
const SignupPage = lazy(() =>
	import("@/features/auth/pages/SignupPage").then((module) => ({
		default: module.SignupPage,
	})),
);
const ForgotPasswordPage = lazy(() =>
	import("@/features/auth/pages/ForgotPasswordPage").then((module) => ({
		default: module.ForgotPasswordPage,
	})),
);
const ResetPasswordPage = lazy(() =>
	import("@/features/auth/pages/ResetPasswordPage").then((module) => ({
		default: module.ResetPasswordPage,
	})),
);
const CreatePlayer = lazy(
	() => import("@/features/home/components/CreatePlayer"),
);
const SeriesCreatePage = lazy(
	() => import("@/features/series/pages/SeriesCreatePage"),
);
const JoinRoomPage = lazy(() =>
	import("@/features/rooms/pages/JoinRoomPage").then((module) => ({
		default: module.JoinRoomPage,
	})),
);
const PredictionNew = lazy(() => import("@/features/predictions/pages/New"));
const EditPrediction = lazy(
	() => import("@/features/predictions/pages/EditPrediction"),
);
const ManagePage = lazy(() => import("@/features/rooms/pages/ManagePage"));
const MembersPage = lazy(() => import("@/features/rooms/pages/MembersPage"));
const RoomSettingsPage = lazy(
	() => import("@/features/rooms/pages/RoomSettingsPage"),
);
const PredictionDuelsPage = lazy(() =>
	import("@/features/duels/pages/PredictionDuelsPage").then((module) => ({
		default: module.PredictionDuelsPage,
	})),
);
const PredictionDuelCreatePage = lazy(() =>
	import("@/features/duels/pages/PredictionDuelCreatePage").then(
		(module) => ({
			default: module.PredictionDuelCreatePage,
		}),
	),
);
const PredictionDuelDetailPage = lazy(() =>
	import("@/features/duels/pages/PredictionDuelDetailPage").then(
		(module) => ({
			default: module.PredictionDuelDetailPage,
		}),
	),
);
const NotFoundPage = lazy(() =>
	import("@/app/router/NotFoundPage").then((module) => ({
		default: module.NotFoundPage,
	})),
);

const withSuspense = (element: ReactElement) => (
	<Suspense fallback={<RouteFallback />}>{element}</Suspense>
);

export const router = createBrowserRouter([
	{
		path: "/login",
		element: withSuspense(<LoginPage />),
		errorElement: <RouteErrorBoundary />,
	},
	{
		path: "/signup",
		element: withSuspense(<SignupPage />),
		errorElement: <RouteErrorBoundary />,
	},
	{
		path: "/forgot-password",
		element: withSuspense(<ForgotPasswordPage />),
		errorElement: <RouteErrorBoundary />,
	},
	{
		path: "/reset-password",
		element: withSuspense(<ResetPasswordPage />),
		errorElement: <RouteErrorBoundary />,
	},
	{
		path: "/auth/callback",
		element: <AuthCallbackPage />,
		errorElement: <RouteErrorBoundary />,
	},
	{
		element: <ProtectedRoute />,
		errorElement: <RouteErrorBoundary />,
		children: [
			{
				element: <AppShell />,
				children: [
					{ path: "/", element: <HomePage /> },
					{ path: "/create-player", element: withSuspense(<CreatePlayer />) },
					{
						path: "/account/delete",
						element: withSuspense(<DeleteAccountPage />),
					},
					{
						path: "/rooms/:roomCode",
						children: [
							{
								path: "join",
								element: withSuspense(<JoinRoomPage />),
							},
							{
								element: <RequireRoomMember />,
								errorElement: <RouteErrorBoundary />,
								children: [
									{
										element: <RoomLayout />,
										errorElement: <RouteErrorBoundary />,
										children: [
											{
												element: <RoomTabsLayout />,
												children: [
													{
														index: true,
														element: <RoomDashboard />,
														handle: {
															header: {
																leftAction: "home",
															},
														},
													},
													{
														path: "leaderboard",
														element: <LeaderboardPage />,
														handle: { header: {} },
													},
													{
														path: "history",
														element: <RoomHistoryPage />,
														handle: { header: {} },
													},
													{
														path: "series",
														element: <SeriesPage />,
														handle: { header: {} },
													},
												],
											},
											{
												path: "activities",
												element: <RoomActivitiesPage />,
												handle: {
													header: {
														leftAction: "back",
														title: "Activity",
													},
												},
											},
											{
												path: "series/new",
												element: withSuspense(
													<SeriesCreatePage />,
												),
												handle: {
													header: {
														leftAction: "back",
														title: "New series",
														parent: "series",
													},
												},
											},
											{
												path: "series/next",
												element: withSuspense(<UpNextPage />),
												handle: {
													header: {
														leftAction: "back",
														title: "Up next",
														parent: "series",
													},
												},
											},
											{
												path: "series/:seriesId",
												element: <SeriesPage />,
												handle: {
													header: {
														leftAction: "back",
														parent: "series",
													},
												},
											},
											{
												path: "predictions/new",
												element: withSuspense(
													<PredictionNew />,
												),
												handle: {
													header: {
														leftAction: "back",
														title: "New prediction",
													},
												},
											},
											{
												path: "predictions/:predictionId/edit",
												element: withSuspense(<EditPrediction />),
												handle: {
													header: {
														leftAction: "back",
														title: "Edit prediction",
														parent: "predictions/:predictionId",
													},
												},
											},
											{
												path: "predictions/:predictionId",
												element: <PredictionPage />,
												handle: {
													header: {
														leftAction: "back",
													},
												},
											},
											{
												path: "manage",
												element: withSuspense(<ManagePage />),
												handle: {
													header: {
														leftAction: "back",
														title: "Manage",
													},
												},
											},
											{
												path: "members",
												element: withSuspense(<MembersPage />),
												handle: {
													header: {
														leftAction: "back",
														title: "Members",
													},
												},
											},
											{
												path: "settings",
												element: withSuspense(<RoomSettingsPage />),
												handle: {
													header: {
														leftAction: "back",
														title: "Room settings",
													},
												},
											},
											// Duels are paused; their routes fall through to 404.
											...(FEATURES.duels
												? [
													{
														path: "predictions/:predictionId/duels",
														element: withSuspense(
															<PredictionDuelsPage />,
														),
														handle: {
															header: {
																leftAction: "back",
															},
														},
													},
													{
														path: "predictions/:predictionId/duels/create",
														element: withSuspense(
															<PredictionDuelCreatePage />,
														),
														handle: {
															header: {
																leftAction: "back",
															},
														},
													},
													{
														path: "predictions/:predictionId/duels/:duelId",
														element: withSuspense(
															<PredictionDuelDetailPage />,
														),
														handle: {
															header: {
																leftAction: "back",
															},
														},
													},
												]
												: []),
										],
									},
								],
							},
						],
					},
				],
			},
		],
	},
	{
		path: "/404",
		element: withSuspense(<NotFoundPage />),
		errorElement: <RouteErrorBoundary />,
	},
	{ path: "*", element: <Navigate to='/404' replace /> },
]);
