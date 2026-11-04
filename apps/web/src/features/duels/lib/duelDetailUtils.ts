import type { Duel, DuelQueueStatus } from "@/features/duels/types/types";
import type { Bet, Prediction } from "@/features/predictions";

export type DuelVisualState =
| "join"
| "matched"
| "resolved"
| "expired"
| "cancelled";

export function toVisualState(duel: Duel): DuelVisualState {
    if (duel.status === "matched") return "matched";
    if (duel.status === "resolved") return "resolved";
    if (duel.status === "expired") return "expired";
    if (duel.status === "cancelled") return "cancelled";
    return "join";
}

export function initials(name: string | null | undefined) {
    if (!name) return "??";
    return name.slice(0, 2).toUpperCase();
}

export function fmtPts(value: number | null | undefined) {
    if (typeof value !== "number" || Number.isNaN(value)) return "0";
    return value.toLocaleString();
}

export function signedPts(value: number) {
    if (value === 0) return "0";
    return value > 0 ? `+${fmtPts(value)}` : `-${fmtPts(Math.abs(value))}`;
}

export function queueStatusLabel(status: DuelQueueStatus) {
    switch (status) {
        case "matched":
            return "Matched";
        case "refunded":
            return "Refunded";
        case "cancelled":
            return "Cancelled";
        default:
            return "Waiting";
    }
}

export function queueStatusTone(status: DuelQueueStatus) {
    switch (status) {
        case "matched":
            return "bg-primary/20 text-primary";
        case "refunded":
            return "bg-secondary text-muted-foreground";
        case "cancelled":
            return "bg-destructive/10 text-destructive";
        default:
            return "bg-secondary text-muted-foreground";
    }
}

export function formatJoinedAt(joinedAt: string) {
    const parsed = new Date(joinedAt);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export function getChallengerPickLabel(
    duel: Duel | undefined,
    prediction: Prediction | null | undefined,
    bets: Bet[],
) {
    if (!duel) return "Challenger";
    if (duel.status == "resolved" || duel.status == "matched") {
        const challengerBet = bets.find((bet) => bet.player_id === duel.challenger.id);
        const optionLabel = prediction?.prediction_options.find(
            (option) => option.id === challengerBet?.option_id,
        )?.label;
        return optionLabel ?? "Challenger";
    }
    return "Challenger";
}

export function getOpponentPickLabel(
    duel: Duel | undefined,
    prediction: Prediction | null | undefined,
    bets: Bet[],
) {
    if (!duel) return "Opponent";
    if (!duel.opponent?.id) return "Opponent";
    if (duel.status == "resolved" || duel.status == "matched") {
        const opponentBet = bets.find((bet) => bet.player_id === duel.opponent?.id);
        const optionLabel = prediction?.prediction_options.find(
            (option) => option.id === opponentBet?.option_id,
        )?.label;
        return optionLabel ?? "Opponent";
    }
    return "Opponent";
}

export function getMyPickLabel(
    prediction: Prediction | null | undefined,
    optionId: string | undefined,
) {
    if (!optionId) return "My pick";
    return (
        prediction?.prediction_options.find((opt) => opt.id === optionId)?.label ??
        "My pick"
    );
}

export function getResolvedParticipants(
    duel: Duel,
    challengerPickLabel: string,
    opponentPickLabel: string,
) {
    const winnerId = duel.winner?.id ?? null;
    let winnerName = duel.winner?.username ?? "Winner";

    if (winnerId === duel.challenger.id) {
        winnerName = duel.challenger.username;
    } else if (winnerId === duel.opponent?.id) {
        winnerName = duel.opponent?.username ?? "Winner";
    }
    
    let winnerPick = "Winning pick";
    if (winnerId === duel.challenger.id) {
        winnerPick = challengerPickLabel;
    } else if (winnerId === duel.opponent?.id) {
        winnerPick = opponentPickLabel;
    }

    const loserName = winnerId === duel.challenger.id
        ? (duel.opponent?.username ?? "Opponent")
        : duel.challenger.username;
    const loserPick =
        winnerId === duel.challenger.id ? opponentPickLabel : challengerPickLabel;

    return { winnerName, winnerPick, loserName, loserPick };
}
