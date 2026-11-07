// Formats deadlines with the browser's Intl, which costs nothing to load.
// (date-fns stays in the prediction form, for its date picker.)

export type DeadlineParts = {
	// "today at 10:00 PM", "tomorrow at 10:00 PM", "Thursday at 9:00 PM", "Nov 14 at 9:00 PM"
	when: string;
	// "Sat, Oct 25"; empty when `when` already names the date
	date: string;
	// "in 23 hours"
	relative: string;
	isPast: boolean;
};

const formatters = {
	time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
	weekdayDate: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }),
	weekday: new Intl.DateTimeFormat("en-US", { weekday: "long" }),
	weekdayShort: new Intl.DateTimeFormat("en-US", { weekday: "short" }),
	monthDay: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }),
};

// Newer browsers put a narrow no-break space before AM/PM; keep plain spaces.
function format(formatter: Intl.DateTimeFormat, date: Date) {
	return formatter.format(date).replace(/[\u202f\u00a0]/g, " ");
}

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Calendar days from `now` to `date` in local time, ignoring the clock.
function calendarDaysBetween(date: Date, now: Date) {
	return Math.round(
		(startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000,
	);
}

type Unit = "second" | "minute" | "hour" | "day" | "month" | "year";

const plural = (value: number, unit: string) =>
	`${value} ${unit}${value === 1 ? "" : "s"}`;

// "23 hours", "1 minute": the largest unit that fits, rounded down. Days and
// longer are counted on the wall clock, so a daylight-saving change in
// between doesn't shave a day off. A month is 30 days and a year 365.
function distance(a: Date, b: Date, forced?: Unit) {
	const [earlier, later] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
	const ms = later.getTime() - earlier.getTime();
	const minutes = ms / 60_000;
	const offsetShift =
		(earlier.getTimezoneOffset() - later.getTimezoneOffset()) * 60_000;
	const wallMinutes = (ms + offsetShift) / 60_000;

	let unit: Unit = forced ?? "year";
	if (!forced) {
		if (minutes < 1) unit = "second";
		else if (minutes < 60) unit = "minute";
		else if (minutes < 1440) unit = "hour";
		else if (wallMinutes < 43_200) unit = "day";
		else if (wallMinutes < 525_600) unit = "month";
	}

	switch (unit) {
		case "second":
			return plural(Math.floor(ms / 1000), "second");
		case "minute":
			return plural(Math.floor(minutes), "minute");
		case "hour":
			return plural(Math.floor(minutes / 60), "hour");
		case "day":
			return plural(Math.floor(wallMinutes / 1440), "day");
		case "month": {
			const months = Math.floor(wallMinutes / 43_200);
			return months === 12 ? "1 year" : plural(months, "month");
		}
		default:
			return plural(Math.floor(wallMinutes / 525_600), "year");
	}
}

// Describes a deadline the way a person would say it, keeping the exact
// date alongside for anything beyond today.
export function describeDeadline(deadline: Date, now = new Date()): DeadlineParts {
	const time = format(formatters.time, deadline);
	const daysAway = calendarDaysBetween(deadline, now);

	let when: string;
	let date = format(formatters.weekdayDate, deadline);
	if (daysAway === 0) {
		when = `today at ${time}`;
		date = "";
	} else if (daysAway === 1) {
		when = `tomorrow at ${time}`;
	} else if (daysAway > 1 && daysAway < 7) {
		when = `${format(formatters.weekday, deadline)} at ${time}`;
		date = format(formatters.monthDay, deadline);
	} else {
		when = `${format(formatters.monthDay, deadline)} at ${time}`;
		date = format(formatters.weekdayShort, deadline);
	}

	const diff = deadline.getTime() - now.getTime();
	const isPast = diff <= 0;
	// "in 33 hours" reads better than "in 1 day" for the next two days.
	const hoursAway = Math.abs(diff) / 3_600_000;
	const span = distance(
		deadline,
		now,
		hoursAway >= 1 && hoursAway < 48 ? "hour" : undefined,
	);

	return {
		when,
		date,
		relative: isPast ? `${span} ago` : `in ${span}`,
		isPast,
	};
}
