import type { RoomSummary } from "./types";

function average(values: number[]) {
    if (values.length === 0) {
        return null;
    }
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function PerformanceBentoGrid({ rooms }: { rooms: RoomSummary[] }) {
    const finished = rooms
        .filter((room) => room.overallScore !== null && room.overallScore !== undefined)
        .sort((a, b) => Date.parse(b.startedAt || "") - Date.parse(a.startedAt || ""));
    const scores = finished.map((room) => room.overallScore as number);
    const latest = scores.length > 1 ? scores[0] - scores[1] : null;
    const wpm = average(rooms.map((room) => room.wpm).filter((value): value is number => typeof value === "number" && value > 0));
    const think = rooms.map((room) => room.thinkSeconds).filter((value): value is number => typeof value === "number" && value > 0);
    const thinkAverage = think.length ? Math.round((think.reduce((sum, value) => sum + value, 0) / think.length) * 10) / 10 : null;
    const ownership = average(rooms.map((room) => room.ownership).filter((value): value is number => typeof value === "number"));
    const readiness = average(scores);
    return (
        <section className="bento" aria-label="Measured from finished interviews">
            <article>
                <span>Readiness</span>
                <strong>{readiness === null ? "—" : `${readiness}`}</strong>
                <em>{latest === null ? "After two finished reports, the change appears here." : `${latest > 0 ? "+" : ""}${latest} since the previous report`}</em>
            </article>
            <article>
                <span>Speaking pace</span>
                <strong>{wpm === null ? "—" : `${wpm} wpm`}</strong>
                <em>{wpm !== null && wpm >= 120 && wpm <= 150 ? "Inside 120 to 150." : "A steady pace is 120 to 150."}</em>
            </article>
            <article>
                <span>Thinking time</span>
                <strong>{thinkAverage === null ? "—" : `${thinkAverage}s`}</strong>
                <em>{thinkAverage !== null && thinkAverage >= 1.5 && thinkAverage <= 4 ? "Inside 1.5 to 4 seconds." : "A composed start is 1.5 to 4 seconds."}</em>
            </article>
            <article>
                <span>Ownership</span>
                <strong>{ownership === null ? "—" : `${ownership}%`}</strong>
                <em>Share of I, me, and my against we and our.</em>
            </article>
        </section>
    );
}

export function SkillPillarSummary({ rooms }: { rooms: RoomSummary[] }) {
    const names = ["Technical depth", "Ownership and impact", "Structure", "Delivery"];
    const bars = names.map((name) => {
        const values = rooms.flatMap((room) => room.pillars ?? []).filter((pillar) => pillar.name === name).map((pillar) => pillar.score);
        const score = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
        return { name, score };
    });
    return (
        <section className="pillars">
            <h2>Pillars</h2>
            <ul>
                {bars.map((bar) => (
                    <li key={bar.name}>
                        <span>{bar.name}</span>
                        <span>{bar.score === null ? "—" : bar.score}</span>
                        <i style={{ width: `${bar.score ?? 0}%` }} />
                    </li>
                ))}
            </ul>
        </section>
    );
}
