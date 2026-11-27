import { useState } from "react";
import type { RoomSummary } from "./types";

const FILTERS = [
    { id: "all", label: "All" },
    { id: "ready", label: "Ready to enter" },
    { id: "draft", label: "Drafts" },
    { id: "done", label: "Completed reports" },
];

function matches(room: RoomSummary, filter: string) {
    if (filter === "ready") {
        return room.status === "ready" || room.status === "live";
    }
    if (filter === "draft") {
        return room.status === "draft" || room.status === "preparing";
    }
    if (filter === "done") {
        return room.status === "completed" || room.status === "report_ready";
    }
    return true;
}

function actionLabel(status: string) {
    if (status === "ready" || status === "live") {
        return "Enter Live Room";
    }
    if (status === "completed" || status === "report_ready") {
        return "View Report";
    }
    return "Resume Setup";
}

export function SavedSessionsTable({
    rooms,
    onOpen,
    onRetake,
    onDelete,
}: {
    rooms: RoomSummary[];
    onOpen: (id: string) => void;
    onRetake: (room: RoomSummary) => void;
    onDelete: (id: string) => void;
}) {
    const [filter, setFilter] = useState("all");
    const shown = rooms.filter((room) => matches(room, filter));
    return (
        <section className="sessions-panel">
            <h2>Saved interviews</h2>
            <div className="pills">
                {FILTERS.map((item) => (
                    <button key={item.id} type="button" className={filter === item.id ? "pill on" : "pill"} onClick={() => setFilter(item.id)}>{item.label}</button>
                ))}
            </div>
            {shown.length === 0 ? <p className="studio-quiet">No rooms in this filter.</p> : (
                <ul className="session-list">
                    {shown.map((room) => (
                        <li key={room.id}>
                            <div className="session-copy">
                                <strong>{room.title || "Untitled room"}</strong>
                                <span>{room.interviewType.replaceAll("_", " ")}{room.company ? ` · ${room.company}` : ""}{room.startedAt ? ` · ${new Date(room.startedAt).toLocaleDateString()}` : ""}</span>
                                <em>{room.source || "Practice template"}</em>
                            </div>
                            <div className="session-actions">
                                <span className={`state state-${room.status}`}>
                                    {room.status.replaceAll("_", " ")}
                                    {room.status === "report_ready" && room.overallScore !== null && room.overallScore !== undefined ? ` · ${room.overallScore}/100` : ""}
                                </span>
                                <button type="button" onClick={() => onOpen(room.id)}>{actionLabel(room.status)}</button>
                                {room.status === "report_ready" || room.status === "completed" ? <button type="button" onClick={() => onRetake(room)}>Retake</button> : null}
                                <button type="button" onClick={() => onDelete(room.id)}>Delete</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
