import { Link } from "react-router-dom";
import { LegalDocument, LegalSection } from "@/features/legal/components/LegalDocument";
import {
	LEGAL_CONTACT_EMAIL,
	LEGAL_MIN_AGE,
	LEGAL_OPERATOR,
} from "@/features/legal/lib/legal";

const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>;

export default function PrivacyPage() {
	return (
		<LegalDocument
			title='Privacy Policy'
			summary={
				<ul className='list-disc space-y-1.5 pl-5'>
					<li>
						We collect what Crow needs to run: your email, the username you pick,
						and what you do in your rooms.
					</li>
					<li>
						Your username, picks and points are visible to members of the rooms you
						join. Nothing is public.
					</li>
					<li>No ads, no tracking, no selling or sharing your data for marketing.</li>
					<li>
						You can delete your account any time from the app; we do it within 30
						days.
					</li>
				</ul>
			}
		>
			<LegalSection id='who' title='1. Who we are'>
				<p>
					Crow (playcrow.app) is a private prediction game for groups of friends. It
					is run by {LEGAL_OPERATOR}, an individual based in Ontario, Canada (“we”,
					“us”). We are responsible for the personal information described here.
					Questions or requests: {mail}.
				</p>
			</LegalSection>

			<LegalSection id='collect' title='2. What we collect'>
				<p>
					<strong>Account.</strong> Your email address and a password (stored only
					as a secure hash by our authentication provider). If you sign in with
					Google, we receive your Google account's email address, name and profile
					picture; we use the name only to suggest a username.
				</p>
				<p>
					<strong>Profile.</strong> The username you choose.
				</p>
				<p>
					<strong>Game activity.</strong> Rooms you create or join and your role in
					them; predictions you create; your picks, stakes, points, results,
					ratings, streaks, trophies and milestones; series ideas and votes; and
					results you reveal or correct as room staff.
				</p>
				<p>
					<strong>Notifications.</strong> If you turn on push notifications, the
					subscription your browser gives us (a delivery address and keys, not your
					phone number) and your notification settings.
				</p>
				<p>
					<strong>Sharing.</strong> When you share a card or invite from Crow, we
					record what kind of thing was shared and when, not who you shared it
					with. If you arrive through a shared link, we note which kind of link
					brought you in when you join a room.
				</p>
				<p>
					<strong>Technical.</strong> Error reports when something breaks in the
					app (what went wrong, the app version and browser, and an anonymous
					account ID), and standard server logs (IP address, browser and time of
					request), kept for security and troubleshooting.
				</p>
				<p>
					<strong>Account deletion requests.</strong> The date and, if you give
					one, your reason.
				</p>
				<p>
					We don't collect your location, contacts, payment details or anything
					from your device beyond what's listed here.
				</p>
			</LegalSection>

			<LegalSection id='use' title='3. How we use it'>
				<ul>
					<li>To run Crow: sign you in, run rooms, settle predictions and keep standings.</li>
					<li>To send the notifications you've turned on.</li>
					<li>To keep the game fair and safe, and enforce our <Link to='/terms'>Terms</Link>.</li>
					<li>To find and fix bugs, and to see which features (like share cards) get used so we can improve them.</li>
					<li>To answer you when you contact us, and to handle deletion requests.</li>
				</ul>
				<p>
					We don't sell your information, show ads, or use your information to
					profile you for advertising. We don't use it to train AI models.
				</p>
				<p>
					If you're in the EU or UK, our legal bases are: performing our agreement
					with you (running the game you signed up for), our legitimate interests
					(security, fixing bugs, improving Crow), and your consent (push
					notifications, which you can turn off at any time).
				</p>
			</LegalSection>

			<LegalSection id='see' title='4. Who can see it'>
				<p>
					<strong>Members of your rooms</strong> see your username, role, picks,
					stakes, points, results and other game activity in that room. Anyone you
					give an invite code or link to can see the room's name, owner and how
					many members it has before joining.
				</p>
				<p>
					<strong>Service providers</strong> process information for us, only to
					provide their service:
				</p>
				<ul>
					<li>Supabase: database, sign-in and backend.</li>
					<li>DigitalOcean: web hosting.</li>
					<li>Google: “Continue with Google” sign-in, if you use it.</li>
					<li>Sentry: error reports.</li>
					<li>
						Your browser's push service (for example Google, Apple or Mozilla):
						delivering notifications, if you turn them on.
					</li>
				</ul>
				<p>
					We may also disclose information if the law requires it, or to protect
					people's safety or our rights. If Crow is ever transferred to someone
					else, this policy goes with it.
				</p>
			</LegalSection>

			<LegalSection id='google' title='5. Information from Google'>
				<p>
					When you sign in with Google, Crow requests only your basic profile and
					email address. Crow's use and transfer of information received from
					Google APIs adheres to the{" "}
					<a
						href='https://developers.google.com/terms/api-services-user-data-policy'
						target='_blank'
						rel='noreferrer'
					>
						Google API Services User Data Policy
					</a>
					, including the Limited Use requirements. We use it only to sign you in
					and suggest a username, and never for advertising.
				</p>
			</LegalSection>

			<LegalSection id='where' title='6. Where it is stored'>
				<p>
					Our providers may store and process information outside Canada,
					including in the United States, where it is subject to local laws. We
					rely on their contractual and security safeguards to protect it.
				</p>
			</LegalSection>

			<LegalSection id='keep' title='7. How long we keep it'>
				<p>
					We keep your information while you have an account. When you delete your
					account (Room menu → Delete account), within 30 days we:
				</p>
				<ul>
					<li>delete your login, email address, notification subscriptions and settings;</li>
					<li>refund your bets on predictions that are still open and remove you from your rooms;</li>
					<li>
						keep your past game records, renamed “Ghost crow” and no longer
						connected to you, so the other players' points and standings stay
						correct.
					</li>
				</ul>
				<p>
					Backups are overwritten on a rolling basis, and error reports and server
					logs are deleted automatically after at most 90 days.
				</p>
			</LegalSection>

			<LegalSection id='rights' title='8. Your choices and rights'>
				<p>You can:</p>
				<ul>
					<li>leave any room, or turn notifications off, at any time in the app;</li>
					<li>ask for a copy of your personal information, or ask us to correct it;</li>
					<li>delete your account from the app, or by emailing us;</li>
					<li>withdraw consent where we rely on it.</li>
				</ul>
				<p>
					Email {mail} and we'll respond within 30 days. We may need to confirm
					it's really you first. If you're not happy with our answer, you can
					complain to the{" "}
					<a href='https://www.priv.gc.ca' target='_blank' rel='noreferrer'>
						Office of the Privacy Commissioner of Canada
					</a>
					, or, in the EU or UK, your local data protection authority. In the EU or
					UK you can also object to or restrict our use of your information, and
					ask for it in a portable format.
				</p>
			</LegalSection>

			<LegalSection id='storage' title='9. Cookies and local storage'>
				<p>
					Crow doesn't use advertising or tracking cookies. It keeps a few things
					in your browser's local storage so the app works: your sign-in session,
					which room and series you last looked at, and whether you've seen a
					tip. Clearing your browser data removes them and signs you out.
				</p>
			</LegalSection>

			<LegalSection id='children' title='10. Children'>
				<p>
					Crow is not for children under {LEGAL_MIN_AGE}. We don't knowingly
					collect information from them; if we learn we have, we delete the
					account. If you think a child under {LEGAL_MIN_AGE} is using Crow, tell
					us at {mail}.
				</p>
			</LegalSection>

			<LegalSection id='security' title='11. Security'>
				<p>
					We use encrypted connections, database access rules that limit each
					person to their own rooms, and providers with strong security practices.
					No system is perfect; if a breach affects you in a way that creates a
					real risk of significant harm, we'll tell you and the Privacy
					Commissioner as the law requires.
				</p>
			</LegalSection>

			<LegalSection id='changes' title='12. Changes'>
				<p>
					If we change this policy, we'll update the date at the top. If the change
					is significant, we'll let you know in the app before it takes effect.
				</p>
			</LegalSection>
		</LegalDocument>
	);
}
