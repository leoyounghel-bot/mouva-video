import type { RemoteJob } from "../types";

export type CandidateCount = 1 | 2 | 4;
export type RoundAttempt = {
  content: string;
  roundId: string;
  requestIds: string[];
  accepted: RemoteJob[];
};

// Freeze one source for the whole round. An uncertain network response retries
// its original request ID; a completed round always gets new IDs when rerolled.
export function candidateRound(
  content: string,
  count: CandidateCount,
  previous: RoundAttempt | null,
): RoundAttempt {
  if (![1, 2, 4].includes(count))
    throw new Error("Choose 1, 2 or 4 candidates.");
  if (
    previous?.content === content &&
    previous.requestIds.length === count &&
    previous.accepted.length < count
  )
    return previous;
  return {
    content,
    roundId: crypto.randomUUID(),
    requestIds: Array.from({ length: count }, () => crypto.randomUUID()),
    accepted: [],
  };
}

export async function submitRound(
  round: RoundAttempt,
  send: (identity: {
    requestId: string;
    roundId: string;
    candidateIndex: number;
    candidateCount: number;
  }) => Promise<RemoteJob>,
  onAccepted: (job: RemoteJob) => void,
) {
  for (
    let index = round.accepted.length;
    index < round.requestIds.length;
    index++
  ) {
    const job = await send({
      requestId: round.requestIds[index],
      roundId: round.roundId,
      candidateIndex: index + 1,
      candidateCount: round.requestIds.length,
    });
    round.accepted.push(job);
    onAccepted(job);
  }
  return [...round.accepted];
}
