import { Link } from "react-router-dom";
import { LegalDocument, LegalSection } from "@/features/legal/components/LegalDocument";
import {
	LEGAL_CONTACT_EMAIL,
	LEGAL_MIN_AGE,
	LEGAL_OPERATOR,
} from "@/features/legal/lib/legal";

const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>;

export default function TermsPage() {
	return (
		<LegalDocument
			title='Terms of Service'
			summary={
				<ul className='list-disc space-y-1.5 pl-5'>
					<li>Crow is a free game for friends. Points are for bragging rights only.</li>
					<li>
						Points have no cash value: they can't be bought, sold or exchanged,
						and Crow must not be used for real-money betting.
					</li>
					<li>Room owners run their rooms and decide results. Play fair and be decent.</li>
					<li>You can leave or delete your account whenever you like.</li>
				</ul>
			}
		>
			<LegalSection id='agreement' title='1. This agreement'>
				<p>
					These terms are an agreement between you and {LEGAL_OPERATOR}, an
					individual in Ontario, Canada, who runs Crow at playcrow.app (“we”,
					“us”). By creating an account or using Crow you agree to them and to our{" "}
					<Link to='/privacy'>Privacy Policy</Link>. If you don't agree, please
					don't use Crow.
				</p>
			</LegalSection>

			<LegalSection id='eligibility' title='2. Who can use Crow'>
				<p>
					You must be at least {LEGAL_MIN_AGE} years old. If you're under the age
					of majority where you live, you need a parent's or guardian's permission.
					You can have one account, and you're responsible for what happens on it,
					so keep your password safe and tell us at {mail} if you think someone
					else is using it.
				</p>
			</LegalSection>

			<LegalSection id='points' title='3. Points are not money'>
				<p>
					Crow is a game of skill and friendly competition, not gambling. Points
					are free, have no monetary value, can't be bought, sold, transferred or
					exchanged for anything, and are not your property. We don't offer
					prizes.
				</p>
				<p>
					You must not use Crow to organise, record or settle bets or wagers
					involving money or anything else of value, including side bets between
					players. We may close rooms or accounts that do.
				</p>
			</LegalSection>

			<LegalSection id='rooms' title='4. Rooms, predictions and results'>
				<p>
					Rooms are private and run by their members. The owner and the staff
					they appoint create predictions, reveal results and can correct a result
					that went out wrong while its series is running. Owners can remove
					members.
				</p>
				<p>
					We don't check whether predictions or results are accurate and we don't
					settle disagreements inside a room; that's between its members. We may
					adjust points, results or standings to fix bugs or undo cheating.
				</p>
			</LegalSection>

			<LegalSection id='conduct' title='5. Play fair and be decent'>
				<p>Don't:</p>
				<ul>
					<li>break the law, or use Crow to help anyone else break it;</li>
					<li>harass, threaten, bully or impersonate anyone;</li>
					<li>
						post hateful, sexually explicit, violent or otherwise offensive
						content, including in usernames, room names and predictions;
					</li>
					<li>share someone else's personal information without their permission;</li>
					<li>
						cheat: use more than one account to gain an edge, exploit bugs, or
						automate play;
					</li>
					<li>
						try to break into, overload, scrape or reverse-engineer Crow, or get
						around its access rules.
					</li>
				</ul>
				<p>
					If you find a bug that affects fairness or security, please tell us at{" "}
					{mail} instead of using it.
				</p>
			</LegalSection>

			<LegalSection id='content' title='6. What you post'>
				<p>
					You keep ownership of what you post in Crow, like room names,
					predictions, series ideas and your username. You give us permission to
					store and show it to the members of your rooms, and to use it to run
					Crow. We can remove anything that breaks these terms. Past game records
					stay after you leave a room or delete your account, as explained in the{" "}
					<Link to='/privacy'>Privacy Policy</Link>.
				</p>
			</LegalSection>

			<LegalSection id='ending' title='7. Leaving, suspension and changes to Crow'>
				<p>
					You can leave any room or delete your account at any time (Room menu →
					Delete account). We may suspend or close accounts or rooms that break
					these terms, and where reasonable we'll tell you why.
				</p>
				<p>
					Crow is free and still in beta. We may change, add or remove features,
					reset or rebalance game data, or stop running Crow. If we shut it down,
					we'll give reasonable notice where we can.
				</p>
			</LegalSection>

			<LegalSection id='ours' title='8. Our stuff'>
				<p>
					The Crow name, logo, design and software belong to us. These terms don't
					give you any rights to them except to use Crow as intended.
				</p>
			</LegalSection>

			<LegalSection id='warranty' title='9. No guarantees'>
				<p>
					Crow is provided “as is” and “as available”. We don't promise it will
					always be available, error-free, or that game data will never be lost.
					To the extent the law allows, we disclaim all warranties, including
					merchantability, fitness for a particular purpose and non-infringement.
				</p>
			</LegalSection>

			<LegalSection id='liability' title='10. Limits on liability'>
				<p>
					To the extent the law allows, we aren't liable for indirect, incidental,
					special, consequential or punitive damages, or for loss of data,
					points or goodwill, arising from your use of Crow. Our total liability
					for any claim about Crow is limited to CAD $50. Nothing in these terms
					limits rights you have under consumer protection laws that can't be
					waived.
				</p>
			</LegalSection>

			<LegalSection id='law' title='11. Governing law'>
				<p>
					These terms are governed by the laws of Ontario and the federal laws of
					Canada that apply there. Disputes go to the courts of Ontario, unless
					the consumer laws where you live give you the right to bring them
					locally.
				</p>
			</LegalSection>

			<LegalSection id='changes' title='12. Changes to these terms'>
				<p>
					We may update these terms. We'll change the date at the top, and for
					significant changes we'll tell you in the app before they take effect.
					If you keep using Crow after that, the new terms apply.
				</p>
			</LegalSection>

			<LegalSection id='contact' title='13. Contact'>
				<p>Questions about these terms: {mail}.</p>
			</LegalSection>
		</LegalDocument>
	);
}
