import { Suspense, lazy, type ReactElement } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { HomePage } from "@/features/home/HomePage";
import { ProtectedRoute } from "@/features/auth";
import { AuthCallbackPage } from "@/features/auth/pages/AuthCallbackPage";
import { RouteFallback } from "@/app/router/RouteFallback";
import { RouteErrorBoundary } from "@/app/router/RouteErrorBoundary";
import { roomPageLoaders } from "@/app/router/roomPages";
import { AppShell } from "@/app/router/AppShell";
import RoomLayout from "@/app/layouts/RoomLayout";
import RoomTabsLayout from "@/app/layouts/RoomTabsLayout";
import { RequireRoomMember } from "@/features/rooms";
// The pages people move between inside a room load with the app, so switching
// tabs never waits on a code download. Rarely used pages stay lazy.
import RoomDashboard from "@/features/rooms/pages/RoomDashboard";
import RoomHistoryPage from "@/features/rooms/pages/RoomHistoryPage";
import RoomActivitiesPage from "@/features/rooms/pages/RoomActivitiesPage";
import SeriesPage from "@/features/series/pages/SeriesPage";
import { PredictionPage } from "@/features/predictions/pages/PredictionPage";
import { LeaderboardPage } from "@/features/leaderboard/pages/LeaderboardPage";

const UpNextPage = lazy(roomPageLoaders.upNext);
const LandingPage = lazy(() =>
	import("@/features/landing").then((module) => ({
		default: module.LandingPage,
	})),
);
const PrivacyPage = lazy(() => import("@/features/legal/pages/PrivacyPage"));
const TermsPage = lazy(() => import("@/features/legal/pages/TermsPage"));
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
const SeriesCreatePage = lazy(roomPageLoaders.seriesCreate);
const JoinRoomPage = lazy(() =>
	import("@/features/rooms/pages/JoinRoomPage").then((module) => ({
		default: module.JoinRoomPage,
	})),
);
const PredictionNew = lazy(roomPageLoaders.predictionNew);
const PredictionNewSet = lazy(roomPageLoaders.predictionNewSet);
const ResolveSeveral = lazy(roomPageLoaders.resolveSeveral);
const EditPrediction = lazy(roomPageLoaders.editPrediction);
const ManagePage = lazy(roomPageLoaders.manage);
const FixturesHomePage = lazy(roomPageLoaders.fixtures);
const BrowseCompetitionsPage = lazy(roomPageLoaders.fixturesBrowse);
const CompetitionFixturesPage = lazy(roomPageLoaders.fixturesCompetition);
const MembersPage = lazy(roomPageLoaders.members);
const RoomSettingsPage = lazy(roomPageLoaders.settings);
// The Crow team's tools: never downloaded by players.
const AdminLayout = lazy(() => import("@/features/admin/pages/AdminLayout"));
const AdminResultsPage = lazy(() => import("@/features/admin/pages/AdminResultsPage"));
const AdminFixturesPage = lazy(() => import("@/features/admin/pages/AdminFixturesPage"));
const AdminCompetitionFixturesPage = lazy(() => import("@/features/admin/pages/AdminCompetitionFixturesPage"));
const AdminCompetitionsPage = lazy(() => import("@/features/admin/pages/AdminCompetitionsPage"));
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
		// Public, signed in or not: Google's consent screen links here.
		path: "/privacy",
		element: withSuspense(<PrivacyPage />),
		errorElement: <RouteErrorBoundary />,
	},
	{
		// Public landing page (mockup). Signed in or not; the buttons adapt.
		path: "/welcome",
		element: withSuspense(<LandingPage />),
		errorElement: <RouteErrorBoundary />,
	},
	{
		path: "/terms",
		element: withSuspense(<TermsPage />),
		errorElement: <RouteErrorBoundary />,
	},
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
						path: "/admin",
						element: withSuspense(<AdminLayout />),
						children: [
							{ index: true, element: withSuspense(<AdminResultsPage />) },
							{ path: "fixtures", element: withSuspense(<AdminFixturesPage />) },
							{ path: "fixtures/:competitionId", element: withSuspense(<AdminCompetitionFixturesPage />) },
							{ path: "competitions", element: withSuspense(<AdminCompetitionsPage />) },
						],
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
														title: "New question",
													},
												},
											},
											{
												path: "predictions/new/set",
												element: withSuspense(<PredictionNewSet />),
												handle: {
													header: {
														leftAction: "back",
														title: "New questions",
													},
												},
											},
											{
												path: "predictions/:predictionId/edit",
												element: withSuspense(<EditPrediction />),
												handle: {
													header: {
														leftAction: "back",
														title: "Edit question",
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
												path: "manage/fixtures",
												element: withSuspense(<FixturesHomePage />),
												handle: {
													header: {
														leftAction: "back",
														title: "Fixtures",
														parent: "manage",
													},
												},
											},
											{
												path: "manage/fixtures/browse",
												element: withSuspense(<BrowseCompetitionsPage />),
												handle: {
													header: {
														leftAction: "back",
														title: "Competitions",
														parent: "manage/fixtures",
													},
												},
											},
											{
												path: "manage/fixtures/:competitionId",
												element: withSuspense(<CompetitionFixturesPage />),
												handle: {
													header: {
														leftAction: "back",
														title: "Fixtures",
														parent: "manage/fixtures",
													},
												},
											},
											{
												path: "manage/close",
												element: withSuspense(<ResolveSeveral />),
												handle: {
													header: {
														leftAction: "back",
														title: "Reveal several",
														parent: "manage",
													},
												},
											},
											{
												path: "members",
												element: withSuspense(<MembersPage />),
												handle: {
													header: {
														leftAction: "back",
														title: "Players",
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
